/**
 * Group status/story tests (parity with @nuiisweety/baileys).
 *
 * Covers:
 *  1. sendMessage({ groupStatusMessage: { text, backgroundColor, textColor, font } })
 *     -> groupStatusMessageV2 with extendedTextMessage.backgroundArgb/textArgb/font
 *  2. audienceType -> contextInfo.statusAudienceMetadata
 *  3. media (video/image/document) prebuilt messages -> V2 wrapper + audience metadata
 *  4. audio -> groupStatusMessage (v1) wrapper (Vanzxy@Fix old-client convention)
 *  5. validation: invalid colors / font / audienceType
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dugong } from '../lib/Socket/dugong.js';

const makeDugong = () => {
    const relays = [];
    const dugong = new Dugong(
        async () => {
            throw new Error('upload should not be called for prebuilt/text stories');
        },
        async (jid, msg, opts = {}) => {
            relays.push({ jid, msg, opts });
        },
        {},
        { authState: { creds: { me: { id: '628000000000@s.whatsapp.net' } } } }
    );
    return { dugong, relays };
};

const GROUP_JID = '120363021773466666@g.us';

test('colored text group status -> V2 wrapper with backgroundArgb/textArgb/font', async () => {
    const { dugong, relays } = makeDugong();
    await dugong.handleGroupStory(
        {
            groupStatusMessage: {
                text: 'Status warna-warni!',
                backgroundColor: '#ff6b9d',
                textColor: '#ffffff',
                font: 3
            }
        },
        GROUP_JID
    );

    assert.equal(relays.length, 1);
    assert.equal(relays[0].jid, GROUP_JID);
    const wrapper = relays[0].msg.groupStatusMessageV2;
    assert.ok(wrapper, 'expected groupStatusMessageV2 wrapper');
    const ext = wrapper.message.extendedTextMessage;
    assert.equal(ext.text, 'Status warna-warni!');
    assert.equal(ext.backgroundArgb, parseInt('FFff6b9d', 16));
    assert.equal(ext.textArgb, 0xffffffff);
    assert.equal(ext.font, 3);
    assert.equal(ext.contextInfo.isGroupStatus, true);
    assert.equal(ext.contextInfo.statusSourceType, 4);
    assert.equal(ext.contextInfo.statusAudienceMetadata.audienceType, 0);
});

test('audienceType is forwarded to statusAudienceMetadata', async () => {
    const { dugong, relays } = makeDugong();
    await dugong.handleGroupStory(
        {
            groupStatusMessage: {
                text: 'halo story',
                backgroundColor: '#ff6b9d',
                textColor: '#ffffff',
                audienceType: 2
            }
        },
        GROUP_JID
    );
    const ext = relays[0].msg.groupStatusMessageV2.message.extendedTextMessage;
    assert.equal(ext.contextInfo.statusAudienceMetadata.audienceType, 2);
});

test('prebuilt media (video) -> V2 wrapper + audience metadata', async () => {
    const { dugong, relays } = makeDugong();
    await dugong.handleGroupStory(
        {
            groupStatusMessage: {
                audienceType: 1,
                message: {
                    videoMessage: { url: 'https://example.com/v.mp4', caption: 'halo' }
                }
            }
        },
        GROUP_JID
    );
    const inner = relays[0].msg.groupStatusMessageV2.message.videoMessage;
    assert.equal(inner.caption, 'halo');
    assert.equal(inner.contextInfo.isGroupStatus, true);
    assert.equal(inner.contextInfo.statusSourceType, 1);
    assert.equal(inner.contextInfo.statusAudienceMetadata.audienceType, 1);
});

test('prebuilt audio uses the v1 groupStatusMessage wrapper (old-client fix)', async () => {
    const { dugong, relays } = makeDugong();
    await dugong.handleGroupStory(
        {
            groupStatusMessage: {
                message: { audioMessage: { url: 'https://example.com/a.mp3', ptt: true } }
            }
        },
        GROUP_JID
    );
    assert.ok(relays[0].msg.groupStatusMessage, 'expected v1 groupStatusMessage wrapper for audio');
    assert.equal(
        relays[0].msg.groupStatusMessage.message.audioMessage.contextInfo.isGroupStatus,
        true
    );
});

test('validation: bad color / font / audienceType throw', async () => {
    const { dugong } = makeDugong();
    await assert.rejects(
        dugong.handleGroupStory({ groupStatusMessage: { text: 'x', backgroundColor: 'merah' } }, GROUP_JID),
        /hex color/
    );
    await assert.rejects(
        dugong.handleGroupStory({ groupStatusMessage: { text: 'x', font: 'besar' } }, GROUP_JID),
        /font.*number/
    );
    await assert.rejects(
        dugong.handleGroupStory({ groupStatusMessage: { text: 'x', audienceType: 'all' } }, GROUP_JID),
        /audienceType.*number/
    );
    await assert.rejects(
        dugong.handleGroupStory({ groupStatusMessage: 'warna-warni' }, GROUP_JID),
        /object/
    );
});
