"use strict"

Object.defineProperty(exports, "__esModule", { value: true })
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const axios = __importDefault(require("axios"));
const { Boom } = require("@hapi/boom")
const { exec } = require("child_process")
const { once } = require("events")
const { spawn } = require('child_process')
const { 
  createHash, 
  randomBytes, 
  createHmac, 
  createCipheriv, 
  createDecipheriv,
  randomUUID
} = require("crypto")
const {
  promises, 
  createReadStream, 
  createWriteStream,
  writeFileSync,
  existsSync
} = require("fs")
const {
  parseBuffer, 
  parseFile, 
  parseStream
} = require('music-metadata')
const { tmpdir } = require("os")
const { join } = require("path")
const {
  Readable, 
  Transform,
  PassThrough
} = require("stream")
const { proto } = require("../../WAProto")
const ffmpeg = require('fluent-ffmpeg');
const {
  MEDIA_PATH_MAP, 
  MEDIA_HKDF_KEY_MAPPING
} = require("../Defaults/media")
const { DEFAULT_ORIGIN } = require("../Defaults/constants")
const { 
  getBinaryNodeChild,
  getBinaryNodeChildBuffer, 
  jidNormalizedUser 
} = require("../WABinary")
const {
  aesDecryptGCM, 
  aesEncryptGCM,
  hkdf 
} = require("./crypto")
const { generateMessageID } = require("./generics")
const getTmpFilesDirectory = () => tmpdir()

const getImageProcessingLibrary = () => {
    let sharp, jimp

    try {
        sharp = require('sharp')
    } catch {}

    if (sharp) {
        return { sharp }
    }

    try {
        jimp = require('jimp')
    } catch {}

    if (jimp) {
        return { jimp }
    }

    throw new Boom('No image processing library available')
}

const hkdfInfoKey = (type) => {
    const hkdfInfo = MEDIA_HKDF_KEY_MAPPING[type]
    return `WhatsApp ${hkdfInfo} Keys`
}

const getRawMediaUploadData = async (media, mediaType, logger) => {
    const { stream } = await getStream(media)

    logger?.debug('got stream for raw upload')

    const hasher = createHash('sha256')
    const filePath = join(getTmpFilesDirectory(), mediaType + generateMessageID())
    const fileWriteStream = createWriteStream(filePath)

    let fileLength = 0

    try {
        for await (const data of stream) {
            fileLength += data.length
            hasher.update(data)

            if (!fileWriteStream.write(data)) {
                await once(fileWriteStream, 'drain')
            }
        }

        fileWriteStream.end()
        await once(fileWriteStream, 'finish')
        stream.destroy()

        const fileSha256 = hasher.digest()

        logger?.debug('hashed data for raw upload')

        return {
            filePath: filePath,
            fileSha256,
            fileLength
        }
    }
    catch (error) {
        fileWriteStream.destroy()
        stream.destroy()

        try {
            await promises.unlink(filePath)
        }
        catch {
            //
        }
        throw error
    }
}

/** generates all the keys required to encrypt/decrypt & sign a media message */
async function getMediaKeys(buffer, mediaType) {
    if (!buffer) {
        throw new Boom('Cannot derive from empty media key')
    }
    if (typeof buffer === 'string') {
        buffer = Buffer.from(buffer.replace('data:base64,', ''), 'base64')
    }
    // expand using HKDF to 112 bytes, also pass in the relevant app info
    const expandedMediaKey = await hkdf(buffer, 112, { info: hkdfInfoKey(mediaType) })
    return {
        iv: expandedMediaKey.slice(0, 16),
        cipherKey: expandedMediaKey.slice(16, 48),
        macKey: expandedMediaKey.slice(48, 80)
    }
}

/** Extracts video thumb using FFMPEG */
const extractVideoThumb = async (path, destPath, time, size) => new Promise((resolve, reject) => {
    const cmd = `ffmpeg -ss ${time} -i ${path} -y -vf scale=${size.width}:-1 -vframes 1 -f image2 ${destPath}`
    exec(cmd, err => {
        if (err) {
            reject(err)
        }
        else {
            resolve()
        }
    })
})

const extractImageThumb = async (bufferOrFilePath, width = 32, quality = 50) => {
    // TODO: Move entirely to sharp, removing jimp as it supports readable streams
    // This will have positive speed and performance impacts as well as minimizing RAM usage.
    if (bufferOrFilePath instanceof Readable) {
        bufferOrFilePath = await toBuffer(bufferOrFilePath)
    }

    const lib = await getImageProcessingLibrary()

    if ('sharp' in lib && typeof lib.sharp === 'function') {
        const img = lib.sharp(bufferOrFilePath)
        const dimensions = await img.metadata()
        const buffer = await img.resize(width).jpeg({ quality: 50 }).toBuffer()
        return {
            buffer,
            original: {
                width: dimensions.width,
                height: dimensions.height
            }
        }
    }
    else if ('jimp' in lib && typeof lib.jimp.read === 'function') {
            const { read, MIME_JPEG, RESIZE_BEZIER, AUTO } = lib.jimp
        const jimp = await read(bufferOrFilePath)
        const dimensions = {
            width: jimp.getWidth(),
            height: jimp.getHeight() 
        }
        const buffer = await jimp
         .quality(quality) 
         .resize(width, AUTO, RESIZE_BEZIER) 
         .getBufferAsync(MIME_JPEG) 
        return {
            buffer,
            original: dimensions
        }
    }
    else {
        throw new Boom('No image processing library available')
    }
}

const encodeBase64EncodedStringForUpload = (b64) => (encodeURIComponent(b64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/\=+$/, '')))

const generateProfilePicture = async (mediaUpload, dimensions) => {
    let buffer

    const { width: w = 640, height: h = 640 } = dimensions || {}

    if (Buffer.isBuffer(mediaUpload)) {
        buffer = mediaUpload
    } else {
        const { stream } = await getStream(mediaUpload)
        buffer = await toBuffer(stream)
    }

    const lib = await getImageProcessingLibrary()
    let img

    if (lib.sharp && typeof lib.sharp?.default === 'function') {
        img = await lib.sharp
            .default(buffer)
            .resize(w, h)
            .jpeg({ quality: 50 })
            .toBuffer()
    }
    else if (lib.jimp && typeof lib.jimp?.read === 'function') {
        const j = await lib.jimp.read(buffer)
        const min = Math.min(j.width, j.height)
        const cropped = j.crop({ x: 0, y: 0, w: min, h: min })
        img = await cropped
            .resize({ w, h, mode: lib.jimp.ResizeStrategy.BILINEAR })
            .getBuffer('image/jpeg', { quality: 50 })
    }
    else {
        img = buffer
    }

    return { img }
}

/** gets the SHA256 of the given media message */
const mediaMessageSHA256B64 = (message) => {
    const media = Object.values(message)[0];
    return (media === null || media === void 0 ? void 0 : media.fileSha256) && Buffer.from(media.fileSha256).toString('base64');
};

async function getAudioDuration(input) {
    const fromMetadata = async () => {
        if (Buffer.isBuffer(input)) {
            const meta = await parseBuffer(input, null, { duration: true });
            return meta?.format?.duration;
        }

        if (typeof input === 'string') {
            const meta = await parseFile(input, { duration: true });
            return meta?.format?.duration;
        }

        const meta = await parseStream(input, null, { duration: true });
        return meta?.format?.duration;
    };

    const fromFFprobe = () =>
        new Promise((resolve, reject) => {
            const stream = Buffer.isBuffer(input)
                ? new PassThrough().end(input)
                : input;

            ffmpeg(stream).ffprobe((err, data) => {
                if (err) return reject(err);
                resolve(data?.format?.duration);
            });
        });

    try {
        const duration = await fromMetadata();
        if (duration) return duration;
    } catch {}

    try {
        return await fromFFprobe();
    } catch {
        throw new Error('Failed to get audio duration');
    }
}

async function getAudioWaveform(input, logger) {
  const BARS = 64;

  const normalize = (arr) => {
    const max = Math.max(...arr) || 1;
    return new Uint8Array(
      arr.map(v => {
        const scaled = Math.log10(1 + (v / max) * 9);
        return Math.max(0, Math.min(100, Math.round(scaled * 100)));
      })
    );
  };

  const getBuffer = async () => {
    if (Buffer.isBuffer(input)) return input;
    if (typeof input === 'string') {
      return await toBuffer(fs.createReadStream(input));
    }
    return await toBuffer(input);
  };

  const audioBuffer = await getBuffer();

  try {
    const { default: decode } = await import('audio-decode');

    const audio = await decode(audioBuffer);

    const channels = audio.numberOfChannels;
    const length = audio.length;

    const mono = new Float32Array(length);

    for (let c = 0; c < channels; c++) {
      const data = audio.getChannelData(c);
      for (let i = 0; i < length; i++) {
        mono[i] += data[i] / channels;
      }
    }

    const blockSize = Math.max(1, Math.floor(length / BARS));
    const waveform = new Array(BARS).fill(0);

    for (let i = 0; i < BARS; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, length);

      let rms = 0;
      let peak = 0;
      let count = 0;

      for (let j = start; j < end; j++) {
        const v = mono[j];
        const abs = Math.abs(v);

        rms += v * v;
        peak = Math.max(peak, abs);
        count++;
      }

      rms = Math.sqrt(rms / (count || 1));
      waveform[i] = rms * 0.7 + peak * 0.3;
    }

    const smoothed = waveform.map((v, i, arr) => {
      const prev = arr[i - 1] ?? v;
      const next = arr[i + 1] ?? v;
      return prev * 0.25 + v * 0.5 + next * 0.25;
    });

    return normalize(smoothed);
  } catch (e) {
    logger?.debug?.('audio-decode failed, fallback ffmpeg: ' + e);
  }

  try {
    const inputStream = new PassThrough();
    inputStream.end(audioBuffer);

    const pcmChunks = [];

    await new Promise((resolve, reject) => {
      ffmpeg(inputStream)
        .noVideo()
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec('pcm_s16le')
        .format('s16le')
        .on('error', reject)
        .on('end', resolve)
        .pipe()
        .on('data', (chunk) => pcmChunks.push(chunk));
    });

    const pcm = Buffer.concat(pcmChunks);
    const sampleCount = Math.floor(pcm.length / 2);

    if (!sampleCount) return new Uint8Array(BARS).fill(0);

    const blockSize = Math.max(1, Math.floor(sampleCount / BARS));
    const waveform = new Array(BARS).fill(0);

    for (let i = 0; i < BARS; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, sampleCount);

      let rms = 0;
      let peak = 0;
      let count = 0;

      for (let j = start; j < end; j++) {
        const sample = pcm.readInt16LE(j * 2) / 32768;
        const abs = Math.abs(sample);

        rms += sample * sample;
        peak = Math.max(peak, abs);
        count++;
      }

      rms = Math.sqrt(rms / (count || 1));
      waveform[i] = rms * 0.75 + peak * 0.25;
    }

    const smoothed = waveform.map((v, i, arr) => {
      const prev = arr[i - 1] ?? v;
      const next = arr[i + 1] ?? v;
      return prev * 0.25 + v * 0.5 + next * 0.25;
    });

    return normalize(smoothed);
  } catch (err) {
    logger?.debug?.('ffmpeg fallback failed: ' + err);

    return new Uint8Array(BARS).fill(0);
  }
}

async function convertToOpusBuffer(buffer, logger) {
    return new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', [
            '-hide_banner',
            '-loglevel', 'info',
            '-i', 'pipe:0',
            '-vn',
            '-ac', '1',
            '-ar', '48000',
            '-acodec', 'libopus',
            '-b:a', '48k',
            '-compression_level', '10',
            '-application', 'voip',
            '-map_metadata', '-1',
            '-f', 'ogg',
            'pipe:1'
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const chunks = [];
        const errChunks = [];

        ff.stdout.on('data', c => chunks.push(c));
        ff.stderr.on('data', c => errChunks.push(c));

        ff.on('error', err => {
            logger?.debug?.(err);
            reject(err);
        });

        ff.stdin.on('error', err => {
            if (err.code !== 'EPIPE') {
                reject(err);
            }
        });

        ff.on('close', (code, signal) => {
            const output = Buffer.concat(chunks);

            logger?.debug?.({
                code,
                signal,
                inputSize: buffer.length,
                outputSize: output.length
            });

            if (signal) {
                return reject(
                    new Error(`ffmpeg killed by ${signal}`)
                );
            }

            if (code !== 0) {
                const err = Buffer.concat(errChunks).toString();
                logger?.debug?.(err);

                return reject(
                    new Error(`ffmpeg exit code ${code}: ${err}`)
                );
            }

            if (!output.length) {
                return reject(
                    new Error('ffmpeg produced empty output')
                );
            }

            resolve(output);
        });

        ff.stdin.end(buffer);
    });
}

async function convertToMp4Buffer(buffer, logger) {
    const tmpDir = join(__dirname, '../tmp')
    await promises.mkdir(tmpDir, { recursive: true })
    const tmp = join(tmpDir, `${Date.now()}-${randomUUID()}.tmp`)
    const out = `${tmp}.mp4`
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
    

    try {
        await promises.writeFile(tmp, buffer)

        await new Promise((resolve, reject) => {
            spawn(ffmpegPath, [
                '-y',
                '-i', tmp,
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-preset', 'veryfast',
                '-crf', '23',
                '-movflags', 'faststart',
                '-map_metadata', '-1',
                '-f', 'mp4',
                out
            ])
                .on('error', reject)
                .on('close', code => {
                    if (code !== 0) {
                        return reject(
                            new Error(`FFmpeg exited with code ${code}`)
                        )
                    }
                    resolve()
                })
        })

        const result = await promises.readFile(out)

        await promises.unlink(tmp)
        await promises.unlink(out)

        return result
    } catch (e) {
        logger?.debug?.(e)

        try {
            if (existsSync(tmp)) {
                await promises.unlink(tmp)
            }

            if (existsSync(out)) {
                await promises.unlink(out)
            }
        } catch {}

        throw e
    }
}

const toReadable = (buffer) => {
    const readable = new Readable({ read: () => { } })
    readable.push(buffer)
    readable.push(null)
    return readable
}

const toBuffer = async (stream) => {
    const chunks = []
    for await (const chunk of stream) {
        chunks.push(chunk)
    }
    stream.destroy()
    return Buffer.concat(chunks)
}

const getStream = async (item, opts) => {
    if (Buffer.isBuffer(item)) {
        return { stream: toReadable(item), type: 'buffer' }
    }

    if ('stream' in item) {
        return { stream: item.stream, type: 'readable' }
    }

    const urlStr = item.url.toString() 

    if (urlStr.startsWith('data:')) {
        const buffer = Buffer.from(urlStr.split(',')[1], 'base64') 
        return { stream: await toReadable(buffer), type: 'buffer' }
    }

    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
        return { stream: await getHttpStream(item.url, opts), type: 'remote' }
    }

    return { stream: createReadStream(item.url), type: 'file' }
}

/** generates a thumbnail for a given media, if required */
async function generateThumbnail(file, mediaType, options) {
    let thumbnail
    let originalImageDimensions

    if (mediaType === 'image') {
        const { buffer, original } = await extractImageThumb(file)

        thumbnail = buffer.toString('base64')

        if (original.width && original.height) {
            originalImageDimensions = {
                width: original.width,
                height: original.height
            }
        }
    }
    else if (mediaType === 'video') {
        const imgFilename = join(getTmpFilesDirectory(), generateMessageID() + '.jpg')
        try {
            await extractVideoThumb(file, imgFilename, '00:00:00', { width: 32, height: 32 })
            const buff = await promises.readFile(imgFilename)

            thumbnail = buff.toString('base64')

            await promises.unlink(imgFilename)
        }
        catch (err) {
            options.logger?.debug('could not generate video thumb: ' + err)
        }
    }
    return {
        thumbnail,
        originalImageDimensions
    }
}

const getHttpStream = async (url, options = {}) => {
    const response = await fetch(url.toString(), {
        dispatcher: options.dispatcher,
        method: 'GET',
        headers: options.headers
    })

    if (!response.ok) {
        throw new Boom(`Failed to fetch stream from ${url}`, { statusCode: response.status, data: { url } })
    }

    return response.body instanceof Readable ? response.body : Readable.fromWeb(response.body)
}

const encryptedStream = async (
    media,
    mediaType,
    { logger, saveOriginalFileIfRequired, opts, isPtt, forceOpus, convertVideo } = {}
) => {
    const { stream, type } = await getStream(media, opts);
    logger?.debug('fetched media stream');

    let finalStream;
    let opusConverted = false;

    let originalBuffer;
    try {
        originalBuffer = await toBuffer(stream);
    } catch {
        originalBuffer = null;
    }

    finalStream = originalBuffer ? toReadable(originalBuffer) : stream;

    if (mediaType === 'audio' && (isPtt === true || forceOpus === true) && originalBuffer) {
        try {
            const opusBuffer = await convertToOpusBuffer(originalBuffer, logger);
            finalStream = toReadable(opusBuffer);
            originalBuffer = opusBuffer;
            opusConverted = true;
            logger?.debug('converted audio to Opus');
        } catch (error) {
            logger?.error(error)
            logger?.error('failed to convert audio to Opus, fallback to original');
            finalStream = toReadable(originalBuffer);
        }
    }

    if (mediaType === 'video' && convertVideo === true && originalBuffer) {
        try {
            const mp4Buffer = await convertToMp4Buffer(originalBuffer, logger);
            finalStream = toReadable(mp4Buffer);
            originalBuffer = mp4Buffer;
            logger?.debug('converted video to mp4');
        } catch (error) {
            logger?.error(error)
            logger?.error('failed to convert video to mp4, fallback to original');
            finalStream = toReadable(originalBuffer);
        }
    }

    const mediaKey = randomBytes(32);
    const { cipherKey, iv, macKey } = await getMediaKeys(mediaKey, mediaType);
    const encWriteStream = new Readable({ read() {} });

    let bodyPath;
    let writeStream;
    let didSaveToTmpPath = false;

    if (mediaType === 'audio') {
        saveOriginalFileIfRequired = true;
    }

    if (type === 'file') {
        bodyPath = media.url;
    } else if (saveOriginalFileIfRequired) {
        bodyPath = join(getTmpFilesDirectory(), mediaType + generateMessageID());
        writeStream = createWriteStream(bodyPath);
        didSaveToTmpPath = true;
    }

    let fileLength = 0;
    const aes = createCipheriv('aes-256-cbc', cipherKey, iv);
    let hmac = createHmac('sha256', macKey).update(iv);
    let sha256Plain = createHash('sha256');
    let sha256Enc = createHash('sha256');

    try {
        for await (const chunk of finalStream) {
            fileLength += chunk.length;

            if (
                type === 'remote' &&
                opts?.maxContentLength &&
                fileLength > opts.maxContentLength
            ) {
                throw new Boom(`content length exceeded when encrypting "${type}"`, {
                    data: { media, type }
                });
            }

            sha256Plain.update(chunk);

            if (writeStream) {
                if (!writeStream.write(chunk)) {
                    await once(writeStream, 'drain');
                }
            }

            const encrypted = aes.update(chunk);
            sha256Enc.update(encrypted);
            hmac.update(encrypted);
            encWriteStream.push(encrypted);
        }

        const final = aes.final();
        sha256Enc.update(final);
        hmac.update(final);
        encWriteStream.push(final);

        const mac = hmac.digest().slice(0, 10);
        sha256Enc.update(mac);

        const fileSha256 = sha256Plain.digest();
        const fileEncSha256 = sha256Enc.digest();

        encWriteStream.push(mac);
        encWriteStream.push(null);

        if (writeStream) {
            writeStream.end();
            await new Promise(resolve => writeStream.on('finish', resolve));
        }

        finalStream.destroy();

        logger?.debug('encrypted data successfully');

        return {
            mediaKey,
            encWriteStream,
            bodyPath,
            mac,
            fileEncSha256,
            fileSha256,
            fileLength,
            didSaveToTmpPath,
            opusConverted
        };
    } catch (error) {
        encWriteStream.destroy();
        writeStream?.destroy();
        aes.destroy();
        hmac.destroy();
        finalStream.destroy();

        if (didSaveToTmpPath && bodyPath) {
            try {
                await promises.unlink(bodyPath);
            } catch {}
        }

        throw error;
    }
};

const DEF_HOST = 'mmg.whatsapp.net'

const AES_CHUNK_SIZE = 16

const toSmallestChunkSize = (num) => {
    return Math.floor(num / AES_CHUNK_SIZE) * AES_CHUNK_SIZE
}
const getUrlFromDirectPath = (directPath) => `https://${DEF_HOST}${directPath}`

const downloadContentFromMessage = async ({ mediaKey, directPath, url }, type, opts = {}) => {
        const isValidMediaUrl = url?.startsWith('https://mmg.whatsapp.net/') 
    const downloadUrl = isValidMediaUrl ? url : getUrlFromDirectPath(directPath)

    if (!downloadUrl) {
            throw new Boom('No valid media URL or directPath present in message', { statusCode: 400 }) 
    }

    const keys = await getMediaKeys(mediaKey, type)
    return downloadEncryptedContent(downloadUrl, keys, opts)
}

/**
 * Decrypts and downloads an AES256-CBC encrypted file given the keys.
 * Assumes the SHA256 of the plaintext is appended to the end of the ciphertext
 * */
const downloadEncryptedContent = async (downloadUrl, { cipherKey, iv }, { startByte, endByte, options } = {}) => {
    let bytesFetched = 0
    let startChunk = 0
    let firstBlockIsIV = false

    // if a start byte is specified -- then we need to fetch the previous chunk as that will form the IV
    if (startByte) {
        const chunk = toSmallestChunkSize(startByte || 0)

        if (chunk) {
            startChunk = chunk - AES_CHUNK_SIZE
            bytesFetched = chunk
            firstBlockIsIV = true
        }
    }

    const endChunk = endByte ? toSmallestChunkSize(endByte || 0) + AES_CHUNK_SIZE : undefined
    const headersInit = options?.headers ? options.headers : undefined
    const headers = {
        ...(headersInit
            ? Array.isArray(headersInit)
                ? Object.fromEntries(headersInit)
                : headersInit
            : {}),
        Origin: DEFAULT_ORIGIN
    }

    if (startChunk || endChunk) {
        headers.Range = `bytes=${startChunk}-`

        if (endChunk) {
            headers.Range += endChunk
        }
    }

    // download the message
    const fetched = await getHttpStream(downloadUrl, {
        ...(options || {}),
        headers
    })

    let remainingBytes = Buffer.from([])
    let aes

    const pushBytes = (bytes, push) => {
        if (startByte || endByte) {
            const start = bytesFetched >= startByte ? undefined : Math.max(startByte - bytesFetched, 0)
            const end = bytesFetched + bytes.length < endByte ? undefined : Math.max(endByte - bytesFetched, 0)

            push(bytes.slice(start, end))
            bytesFetched += bytes.length
        }
        else {
            push(bytes)
        }
    }

    const output = new Transform({
        transform(chunk, _, callback) {
            let data = Buffer.concat([remainingBytes, chunk])

            const decryptLength = toSmallestChunkSize(data.length)

            remainingBytes = data.slice(decryptLength)
            data = data.slice(0, decryptLength)

            if (!aes) {
                let ivValue = iv

                if (firstBlockIsIV) {
                    ivValue = data.slice(0, AES_CHUNK_SIZE)
                    data = data.slice(AES_CHUNK_SIZE)
                }

                aes = createDecipheriv('aes-256-cbc', cipherKey, ivValue)

                // if an end byte that is not EOF is specified
                // stop auto padding (PKCS7) -- otherwise throws an error for decryption
                if (endByte) {
                    aes.setAutoPadding(false)
                }
            }
            try {
                pushBytes(aes.update(data), b => this.push(b))
                callback()
            }
            catch (error) {
                callback(error)
            }
        },
        final(callback) {
            try {
                pushBytes(aes.final(), b => this.push(b))
                callback()
            }
            catch (error) {
                callback(error)
            }
        }
    })

    return fetched.pipe(output, { end: true })
}

function extensionForMediaMessage(message) {
    const getExtension = (mimetype) => mimetype.split('')[0].split('/')[1]
    const type = Object.keys(message)[0]
    let extension
    if (type === 'locationMessage' ||
        type === 'liveLocationMessage' ||
        type === 'productMessage') {
        extension = '.jpeg'
    }
    else {
        const messageContent = message[type]
        extension = getExtension(messageContent.mimetype)
    }
    return extension
}

const isNodeRuntime = () => {
    return (typeof process !== 'undefined' &&
        process.versions?.node !== null &&
        typeof process.versions.bun === 'undefined' &&
        typeof globalThis.Deno === 'undefined')
}

const uploadWithNodeHttp = async ({ url, filePath, headers, timeoutMs, agent }, redirectCount = 0) => {
    if (redirectCount > 5) {
        throw new Error('Too many redirects')
    }

    const parsedUrl = new URL(url)
    const httpModule = parsedUrl.protocol === 'https:' ? require('https') : require('http')

    // Get file size for Content-Length header (required for Node.js streaming)
    const fileStats = await promises.stat(filePath)
    const fileSize = fileStats.size

    return new Promise((resolve, reject) => {
        const req = httpModule.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                ...headers,
                'Content-Length': fileSize
            },
            agent,
            timeout: timeoutMs
        }, res => {
            // Handle redirects (3xx)
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume() // Consume response to free resources

                const newUrl = new URL(res.headers.location, url).toString()

                resolve(uploadWithNodeHttp({
                    url: newUrl,
                    filePath,
                    headers,
                    timeoutMs,
                    agent
                }, redirectCount + 1))
                return
            }

            let body = ''

            res.on('data', chunk => (body += chunk))
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body))
                }
                catch {
                    resolve(undefined)
                }
            })
        })

        req.on('error', reject)
        req.on('timeout', () => {
            req.destroy()
            reject(new Error('Upload timeout'))
        })

        const stream = createReadStream(filePath)

        stream.pipe(req)
        stream.on('error', err => {
            req.destroy()
            reject(err)
        })
    })
}

const uploadWithFetch = async ({ url, filePath, headers, timeoutMs, agent }) => {
    // Convert Node.js Readable to Web ReadableStream
    const nodeStream = createReadStream(filePath)
    const webStream = Readable.toWeb(nodeStream)
    const response = await fetch(url, {
        dispatcher: agent,
        method: 'POST',
        body: webStream,
        headers,
        duplex: 'half',
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
    })

    try {
        return (await response.json())
    }
    catch {
        return undefined
    }
}

/**
 * Uploads media to WhatsApp servers.
 *
 * ## Why we have two upload implementations:
 *
 * Node.js's native `fetch` (powered by undici) has a known bug where it buffers
 * the entire request body in memory before sending, even when using streams.
 * This causes memory issues with large files (e.g., 1GB file = 1GB+ memory usage).
 * See: https://github.com/nodejs/undici/issues/4058
 *
 * Other runtimes (Bun, Deno, browsers) correctly stream the request body without
 * buffering, so we can use the web-standard Fetch API there.
 *
 * ## Future considerations:
 * Once the undici bug is fixed, we can simplify this to use only the Fetch API
 * across all runtimes. Monitor the GitHub issue for updates.
 */
const uploadMedia = async (params, logger) => {
    if (isNodeRuntime()) {
        logger?.debug('Using Node.js https module for upload (avoids undici buffering bug)')
        return uploadWithNodeHttp(params)
    }
    else {
        logger?.debug('Using web-standard Fetch API for upload');
        return uploadWithFetch(params)
    }
}

const prepareStream = async (media, mediaType, { logger, saveOriginalFileIfRequired, opts, convertVideo } = {}) => { // Tambah convertVideo
    const { stream, type } = await getStream(media, opts);
    logger === null || logger === void 0 ? void 0 : logger.debug('fetched media stream');
    
    let buffer = await toBuffer(stream);
    if (mediaType === 'video' && convertVideo) {
        try {
            buffer = await convertToMp4Buffer(buffer, logger);
            logger?.debug('converted video to mp4 for newsletter');
        } catch (e) {
            logger?.error('failed to convert video for newsletter');
        }
    }

    let bodyPath;
    let didSaveToTmpPath = false;
    try {
        if (type === 'file') {
            bodyPath = media.url;
        }
        else if (saveOriginalFileIfRequired) {
            bodyPath = join(getTmpFilesDirectory(), mediaType + generateMessageID());
            writeFileSync(bodyPath, buffer);
            didSaveToTmpPath = true;
        }
        const fileLength = buffer.length;
        const fileSha256 = createHash('sha256').update(buffer).digest();
        
        return {
            mediaKey: undefined,
            encWriteStream: buffer,
            fileLength,
            fileSha256,
            fileEncSha256: undefined,
            bodyPath,
            didSaveToTmpPath
        };
    }
    catch (error) {
        if (didSaveToTmpPath) {
            try { await promises.unlink(bodyPath); } catch (err) {}
        }
        throw error;
    }
};

const getWAUploadToServer = ({ customUploadHosts, fetchAgent, logger, options }, refreshMediaConn) => {
    return async (stream, { mediaType, fileEncSha256B64, newsletter, timeoutMs }) => {
        var _a, _b;
        let uploadInfo = await refreshMediaConn(false);
        let urls;
        const hosts = [...customUploadHosts, ...uploadInfo.hosts];
        const chunks = [];
        if (!Buffer.isBuffer(stream)) {
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
        }
        const reqBody = Buffer.isBuffer(stream) ? stream : Buffer.concat(chunks);
        fileEncSha256B64 = encodeBase64EncodedStringForUpload(fileEncSha256B64);
        let media = MEDIA_PATH_MAP[mediaType];
        if (newsletter) {
            media = media === null || media === void 0 ? void 0 : media.replace('/mms/', '/newsletter/newsletter-');
        }
        for (const { hostname, maxContentLengthBytes } of hosts) {
            logger.debug(`uploading to "${hostname}"`);
            const auth = encodeURIComponent(uploadInfo.auth);
            const url = `https://${hostname}${media}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}`;
            let result;
            try {
                if (maxContentLengthBytes && reqBody.length > maxContentLengthBytes) {
                    throw new Boom(`Body too large for "${hostname}"`, { statusCode: 413 });
                }
                const body = await axios.default.post(url, reqBody, {
                    ...options,
                    headers: {
                        ...options.headers || {},
                        'Content-Type': 'application/octet-stream',
                        'Origin': DEFAULT_ORIGIN
                    },
                    httpsAgent: fetchAgent,
                    timeout: timeoutMs,
                    responseType: 'json',
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                });
                result = body.data;
                if ((result === null || result === void 0 ? void 0 : result.url) || (result === null || result === void 0 ? void 0 : result.directPath)) {
                    urls = {
                        mediaUrl: result.url,
                        directPath: result.direct_path,
                        handle: result.handle
                    };
                    break;
                }
                else {
                    uploadInfo = await refreshMediaConn(true);
                    throw new Error(`upload failed, reason: ${JSON.stringify(result)}`);
                }
            }
            catch (error) {
                if (axios.default.isAxiosError(error)) {
                    result = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data;
                }
                const isLast = hostname === ((_b = hosts[uploadInfo.hosts.length - 1]) === null || _b === void 0 ? void 0 : _b.hostname);
                logger.warn({ trace: error.stack, uploadResult: result }, `Error in uploading to ${hostname} ${isLast ? '' : ', retrying...'}`);
            }
        }
        if (!urls) {
            throw new Boom('Media upload failed on all hosts', { statusCode: 500 });
        }
        return urls;
    };
};

const getMediaRetryKey = (mediaKey) => {
    return hkdf(mediaKey, 32, { info: 'WhatsApp Media Retry Notification' })
}
/**
 * Generate a binary node that will request the phone to re-upload the media & return the newly uploaded URL
 */
const encryptMediaRetryRequest = async (key, mediaKey, meId) => {
    const recp = { stanzaId: key.id }
    const recpBuffer = proto.ServerErrorReceipt.encode(recp).finish()
    const iv = randomBytes(12)
    const retryKey = await getMediaRetryKey(mediaKey)
    const ciphertext = aesEncryptGCM(recpBuffer, retryKey, iv, Buffer.from(key.id))
    const req = {
        tag: 'receipt',
        attrs: {
            id: key.id,
            to: jidNormalizedUser(meId),
            type: 'server-error'
        },
        content: [
            // this encrypt node is actually pretty useless
            // the media is returned even without this node
            // keeping it here to maintain parity with WA Web
            {
                tag: 'encrypt',
                attrs: {},
                content: [
                    { tag: 'enc_p', attrs: {}, content: ciphertext },
                    { tag: 'enc_iv', attrs: {}, content: iv }
                ]
            },
            {
                tag: 'rmr',
                attrs: {
                    jid: key.remoteJid,
                    from_me: (!!key.fromMe).toString(),
                    participant: key.participant || undefined
                }
            }
        ]
    }
    return req
}

const decodeMediaRetryNode = (node) => {
    const rmrNode = getBinaryNodeChild(node, 'rmr')
    const event = {
        key: {
            id: node.attrs.id,
            remoteJid: rmrNode.attrs.jid,
            fromMe: rmrNode.attrs.from_me === 'true',
            participant: rmrNode.attrs.participant
        }
    }
    const errorNode = getBinaryNodeChild(node, 'error')
    if (errorNode) {
        const errorCode = +errorNode.attrs.code
        event.error = new Boom(`Failed to re-upload media (${errorCode})`, { data: errorNode.attrs, statusCode: getStatusCodeForMediaRetry(errorCode) })
    }
    else {
        const encryptedInfoNode = getBinaryNodeChild(node, 'encrypt')
        const ciphertext = getBinaryNodeChildBuffer(encryptedInfoNode, 'enc_p')
        const iv = getBinaryNodeChildBuffer(encryptedInfoNode, 'enc_iv')
        if (ciphertext && iv) {
            event.media = { ciphertext, iv }
        }
        else {
            event.error = new Boom('Failed to re-upload media (missing ciphertext)', { statusCode: 404 })
        }
    }
    return event
}

const decryptMediaRetryData = async ({ ciphertext, iv }, mediaKey, msgId) => {
    const retryKey = await getMediaRetryKey(mediaKey)
    const plaintext = aesDecryptGCM(ciphertext, retryKey, iv, Buffer.from(msgId))
    return proto.MediaRetryNotification.decode(plaintext)
}

const getStatusCodeForMediaRetry = (code) => MEDIA_RETRY_STATUS_MAP[code]

const MEDIA_RETRY_STATUS_MAP = {
    [proto.MediaRetryNotification.ResultType.SUCCESS]: 200,
    [proto.MediaRetryNotification.ResultType.DECRYPTION_ERROR]: 412,
    [proto.MediaRetryNotification.ResultType.NOT_FOUND]: 404,
    [proto.MediaRetryNotification.ResultType.GENERAL_ERROR]: 418,
}

module.exports = {
  hkdfInfoKey, 
  getMediaKeys, 
  extractVideoThumb, 
  extractImageThumb, 
  encodeBase64EncodedStringForUpload, 
  generateProfilePicture, 
  mediaMessageSHA256B64, 
  getAudioDuration, 
  getAudioWaveform, 
  toReadable, 
  toBuffer, 
  getStream, 
  generateThumbnail, 
  getHttpStream, 
  prepareStream, 
  encryptedStream, 
  getUrlFromDirectPath, 
  downloadContentFromMessage, 
  downloadEncryptedContent, 
  extensionForMediaMessage, 
  uploadWithNodeHttp, 
  getRawMediaUploadData, 
  getWAUploadToServer, 
  getMediaRetryKey, 
  encryptMediaRetryRequest, 
  decodeMediaRetryNode, 
  decryptMediaRetryData, 
  getStatusCodeForMediaRetry, 
  MEDIA_RETRY_STATUS_MAP
}