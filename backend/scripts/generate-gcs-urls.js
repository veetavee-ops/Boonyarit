/**
 * generate-gcs-urls.js
 * Migration: generate long-lived signed URLs (2099) for group messages
 * that have gcsPaths/gcsPath in GCS but no gcsUrl/gcsUrls yet.
 *
 * Run: node scripts/generate-gcs-urls.js
 */
require('dotenv').config();
const sequelize = require('../config/database');
const { Message } = require('../models/index');
const { getSignedUrlLong } = require('../services/gcsService');

const EXPIRES = '2099-12-31T23:59:59Z';

async function run() {
    await sequelize.authenticate();

    // ── Images: have gcsPaths but no gcsUrls ──────────────────────────────────
    const [images] = await sequelize.query(`
        SELECT * FROM messages
        WHERE "messageType" = 'image'
          AND "sourceType" = 'group'
          AND (metadata->>'gcsPaths') IS NOT NULL
          AND (metadata->>'gcsUrls') IS NULL
    `);

    console.log(`\n📷 Images: ${images.length} messages`);
    let ok = 0, fail = 0;
    for (const msg of images) {
        try {
            const metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
            const gcsPaths = metadata.gcsPaths;
            const gcsUrls = [];
            for (const p of gcsPaths) {
                const { url } = await getSignedUrlLong(p);
                gcsUrls.push(url);
            }
            await sequelize.query(
                `UPDATE messages SET metadata = :meta, "updatedAt" = NOW() WHERE id = :id`,
                { replacements: { meta: JSON.stringify({ ...metadata, gcsUrls, gcsUrlExpires: EXPIRES }), id: msg.id } }
            );
            ok++;
        } catch (e) {
            console.error(`  ❌ ${msg.id}: ${e.message}`);
            fail++;
        }
    }
    console.log(`  ✅ ${ok}  ❌ ${fail}`);

    // ── Video / Audio / File: have gcsPath but no gcsUrl ─────────────────────
    for (const type of ['video', 'audio', 'file']) {
        const [msgs] = await sequelize.query(`
            SELECT * FROM messages
            WHERE "messageType" = '${type}'
              AND "sourceType" = 'group'
              AND (metadata->>'gcsPath') IS NOT NULL
              AND (metadata->>'gcsUrl') IS NULL
        `);

        const icon = { video: '🎬', audio: '🎤', file: '📎' }[type];
        console.log(`\n${icon} ${type}: ${msgs.length} messages`);
        ok = 0; fail = 0;
        for (const msg of msgs) {
            try {
                const metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
                const { url: gcsUrl } = await getSignedUrlLong(metadata.gcsPath);
                await sequelize.query(
                    `UPDATE messages SET metadata = :meta, "updatedAt" = NOW() WHERE id = :id`,
                    { replacements: { meta: JSON.stringify({ ...metadata, gcsUrl, gcsUrlExpires: EXPIRES }), id: msg.id } }
                );
                ok++;
            } catch (e) {
                console.error(`  ❌ ${msg.id}: ${e.message}`);
                fail++;
            }
        }
        console.log(`  ✅ ${ok}  ❌ ${fail}`);
    }

    // ── Summary: messages with no gcsPath at all (cannot recover) ────────────
    const [noGcs] = await sequelize.query(`
        SELECT "messageType", COUNT(*) as count FROM messages
        WHERE "sourceType" = 'group'
          AND "messageType" IN ('image', 'video', 'audio', 'file')
          AND (metadata->>'gcsPaths') IS NULL
          AND (metadata->>'gcsPath') IS NULL
        GROUP BY "messageType"
    `);

    if (noGcs.length > 0) {
        console.log('\n⚠️  Messages with no GCS path (LINE content expired, unrecoverable):');
        for (const row of noGcs) {
            console.log(`   ${row.messageType}: ${row.count} messages`);
        }
    }

    console.log('\n🎉 Done');
    process.exit(0);
}

run().catch(e => { console.error('💥 Fatal:', e.message); process.exit(1); });
