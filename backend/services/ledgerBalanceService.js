// คำนวณ + cascade แก้ไขยอดคงเหลือของ LedgerBalanceEntry (ฟีเจอร์ "เช็คยอดสมุดบัญชี") — ต่างจาก
// ledgerService.js (AccountLedgerEntry ของ PaymentVerification) เพราะที่นี่ยอดต่อเนื่องกันจริง
// (calculatedBalance ของแถวหนึ่ง = previousBalance ของแถวถัดไป) แก้รายการเก่าแถวเดียวต้องคำนวณ
// ยอดของทุกแถวหลังจากนั้นใหม่หมด ไม่ใช่แค่ลบ-สร้างใหม่ทั้งก้อนแบบ AccountLedgerEntry
const { LedgerBalanceEntry } = require('../models/index');

// pure function — ไม่แตะ DB รับ array ของ entry (เรียงตาม submittedAt ASC แล้ว) + index ที่จะเริ่ม
// คำนวณใหม่ คืน array ใหม่ (ไม่แก้ของเดิม) โดยไล่คำนวณ previousBalance/calculatedBalance ต่อเนื่อง
// จากแถวก่อนหน้าไปเรื่อยๆ จนจบ — แถว seed ไม่มี amount/direction ให้คำนวณ calculatedBalance คงค่าเดิมไว้
// (เป็นยอดตั้งต้นที่กำหนดตรงๆ จากรูปสมุด ไม่ใช่ผลจากการบวกลบ)
function recalculateChain(entries, fromIndex = 0) {
    const result = entries.map((e) => ({ ...e }));
    for (let i = fromIndex; i < result.length; i++) {
        const entry = result[i];
        const prevBalance = i === 0 ? null : result[i - 1].calculatedBalance;
        entry.previousBalance = prevBalance;

        if (entry.entryType === 'seed') continue; // ยอดตั้งต้น ไม่คำนวณจาก amount/direction

        const amount = Number(entry.amount) || 0;
        entry.calculatedBalance = entry.direction === 'in'
            ? Number(prevBalance) + amount
            : Number(prevBalance) - amount;
    }
    return result;
}

// impure — โหลดทุกแถวของกลุ่มเดียวกัน (เรียงตาม submittedAt), แก้ไขแถวที่ระบุ (amount/direction/
// occurredAt/correctionNote), คำนวณยอดใหม่ต่อเนื่องตั้งแต่แถวนั้นเป็นต้นไป แล้วเขียนกลับ DB ทีละแถว
async function applyCorrectionAndRecalculate(entryId, updates, correctedBy) {
    const target = await LedgerBalanceEntry.findByPk(entryId);
    if (!target) throw new Error('ไม่พบรายการนี้');

    const allEntries = await LedgerBalanceEntry.findAll({
        where: { groupId: target.groupId },
        order: [['submittedAt', 'ASC']],
    });

    const targetIndex = allEntries.findIndex((e) => e.id === entryId);
    if (targetIndex === -1) throw new Error('ไม่พบรายการนี้ในสายข้อมูลของกลุ่มนี้');

    const correctionFields = { ...updates, correctedBy, correctedAt: new Date(), status: 'corrected' };

    const plainEntries = allEntries.map((e) => e.get({ plain: true }));
    Object.assign(plainEntries[targetIndex], correctionFields);

    const recalculated = recalculateChain(plainEntries, targetIndex);

    for (let i = targetIndex; i < recalculated.length; i++) {
        const fieldsToSave = {
            previousBalance: recalculated[i].previousBalance,
            calculatedBalance: recalculated[i].calculatedBalance,
            ...(i === targetIndex ? correctionFields : {}),
        };
        await LedgerBalanceEntry.update(fieldsToSave, { where: { id: recalculated[i].id } });
    }

    return LedgerBalanceEntry.findByPk(entryId);
}

module.exports = { recalculateChain, applyCorrectionAndRecalculate };
