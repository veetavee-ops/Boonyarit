// คำนวณ + sync ตาราง AccountLedgerEntry (รายรับ-รายจ่าย-เงินคงเหลือ) จาก bankItems ของ
// PaymentVerification แต่ละ submission — ใช้ร่วมกันทั้งตอนสร้างใหม่ (webhook) และตอนแก้ไขมือ (correction)
const { AccountLedgerEntry } = require('../models/index');

// รวมวันที่ของ submission กับ "time" ที่ OCR อ่านได้ (เช่น "14:58:04") ให้เป็น Date จริง
// ถ้า parse ไม่ได้ (รูปแบบแปลก/ไม่มี) fallback เป็น submittedAt ตรงๆ
function resolveOccurredAt(submittedAt, timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return submittedAt;
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return submittedAt;
    const [, hh, mm, ss] = match;
    const d = new Date(submittedAt);
    d.setHours(Number(hh), Number(mm), ss ? Number(ss) : 0, 0);
    return d;
}

// pure function — ไม่แตะ DB คืน array ของแถว ledger พร้อม runningBalance
// bankItems[0] = รายการล่าสุด (แอปธนาคารแสดงรายการใหม่สุดไว้บนสุดเสมอ) → เดินสูตรย้อนจาก endingBalance ลงมา
function buildLedgerRows(bankItems, endingBalance, submittedAt) {
    if (!Array.isArray(bankItems) || bankItems.length === 0) return [];

    const rows = [];
    let runningBalance = endingBalance != null ? Number(endingBalance) : null;

    bankItems.forEach((item, i) => {
        const amount = Number(item.amount) || 0;
        const direction = item.direction === 'in' ? 'in' : 'out';

        rows.push({
            direction,
            amount,
            counterName: item.counterName || null,
            counterAccount: item.counterAccount || null,
            occurredAt: resolveOccurredAt(submittedAt, item.time),
            runningBalance,
            sortOrder: i,
        });

        // ย้อนกลับผลของรายการนี้ (ใหม่กว่า) เพื่อได้ยอดคงเหลือ ณ ก่อนรายการนี้ ใช้กับแถวถัดไป (เก่ากว่า)
        if (runningBalance != null) {
            runningBalance = direction === 'out' ? runningBalance + amount : runningBalance - amount;
        }
    });

    return rows;
}

// ลบ ledger entries เดิมของ verification นี้ (ถ้ามี) แล้วสร้างใหม่จาก bankItems + endingBalance ปัจจุบัน
// เรียกได้ทั้งตอนสร้าง PaymentVerification ใหม่ และตอนแก้ไขมือ (correction) — bulk replace ง่ายกว่า diff
async function syncLedgerForVerification(verification) {
    await AccountLedgerEntry.destroy({ where: { paymentVerificationId: verification.id } });

    const rows = buildLedgerRows(verification.bankItems, verification.endingBalance, verification.submittedAt);
    if (rows.length === 0) return;

    await AccountLedgerEntry.bulkCreate(
        rows.map((row) => ({
            ...row,
            groupId: verification.groupId,
            paymentVerificationId: verification.id,
        }))
    );
}

module.exports = { buildLedgerRows, syncLedgerForVerification };
