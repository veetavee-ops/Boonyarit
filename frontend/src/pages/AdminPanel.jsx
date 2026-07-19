import { useState, useEffect } from 'react';
import { fetchUsers, createUser, updateUserLineId, updateUserRole, deleteUser, assignGroupToUser, unassignGroupFromUser } from '../api/users';
import { fetchGroups } from '../api/messages';
import { fetchLineUsers, toggleLineUserSearch } from '../api/lineUsers';
import { fetchSettings, updateSetting } from '../api/settings';
import { toggleGroupFlag } from '../api/groupFlags';
import { getInitials, getColor } from '../utils/helpers';
import './AdminPanel.css';

// ธงต่อกลุ่มที่เปิด/ปิดได้ในการ์ด "ตั้งค่าเฉพาะกลุ่ม" — เพิ่มฟีเจอร์ใหม่ในอนาคตแค่เพิ่ม object ในนี้
// (ต้องเพิ่มชื่อ field ในฝั่ง backend ALLOWED_GROUP_FLAG_FIELDS ด้วย ดู routes/groups.js)
const GROUP_FLAGS = [
  { field: 'isPaymentVerifyGroup', label: 'ตรวจสอบการโอน-ตั้งเบิก' },
  { field: 'isReceiptSummaryGroup', label: 'สรุปบิลซื้อของ' },
  { field: 'isLedgerBalanceGroup', label: 'เช็คยอดสมุดบัญชี (ยืม-คืนเงิน)' },
];

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newLineUserId, setNewLineUserId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lineUsers, setLineUsers] = useState([]);
  const [lineUsersLoading, setLineUsersLoading] = useState(true);
  const [driveEnabled, setDriveEnabled] = useState(true);
  const [driveToggling, setDriveToggling] = useState(false);
  // คำสั่งค้นหาไฟล์ผ่าน LINE bot — แก้เองได้ตรงนี้ ไม่ต้องแก้โค้ด (default "ค้นหา")
  const [searchKeyword, setSearchKeyword] = useState('ค้นหา');
  const [searchKeywordSaving, setSearchKeywordSaving] = useState(false);
  const [searchKeywordSaved, setSearchKeywordSaved] = useState(false);
  // คำสั่งให้ AI สรุปแชทวันนี้ผ่าน LINE bot — แก้เองได้เหมือนกัน (default "สรุป")
  const [summarizeKeyword, setSummarizeKeyword] = useState('สรุปเลย');
  const [summarizeKeywordSaving, setSummarizeKeywordSaving] = useState(false);
  const [summarizeKeywordSaved, setSummarizeKeywordSaved] = useState(false);
  // คำสั่งเปิด/ปิดสรุปบิลซื้อของ (OCR) ผ่าน LINE bot — พิมพ์ครั้งแรกเริ่มรวบรวมรูป พิมพ์ซ้ำปิด+สรุป (default "225588")
  const [receiptSummaryKeyword, setReceiptSummaryKeyword] = useState('225588');
  const [receiptSummaryKeywordSaving, setReceiptSummaryKeywordSaving] = useState(false);
  const [receiptSummaryKeywordSaved, setReceiptSummaryKeywordSaved] = useState(false);
  // คำสั่ง "เช็คสมุด" ของฟีเจอร์เช็คยอดสมุดบัญชี ผ่าน LINE bot — คนละคำสั่งกับสรุปบิลด้านบน (default "เช็คสมุด")
  const [ledgerBookCheckKeyword, setLedgerBookCheckKeyword] = useState('เช็คสมุด');
  const [ledgerBookCheckKeywordSaving, setLedgerBookCheckKeywordSaving] = useState(false);
  const [ledgerBookCheckKeywordSaved, setLedgerBookCheckKeywordSaved] = useState(false);
  // ค้นหาชื่อกลุ่มในการ์ด "ตั้งค่าเฉพาะกลุ่ม" (เปิด/ปิดธงฟีเจอร์ต่อกลุ่ม)
  const [groupFlagSearch, setGroupFlagSearch] = useState('');

  useEffect(() => {
    Promise.all([fetchUsers(), fetchGroups()])
      .then(([u, g]) => {
        setUsers(Array.isArray(u) ? u : []);
        setGroups(Array.isArray(g) ? g.filter((x) => !x.isPrivate) : []);
      })
      .catch(() => setError('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));

    fetchLineUsers()
      .then((data) => setLineUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLineUsersLoading(false));

    fetchSettings()
      .then((s) => {
        if (s.drive_enabled !== undefined) setDriveEnabled(s.drive_enabled === 'true');
        if (s.search_keyword) setSearchKeyword(s.search_keyword);
        if (s.summarize_keyword) setSummarizeKeyword(s.summarize_keyword);
        if (s.receipt_summary_keyword) setReceiptSummaryKeyword(s.receipt_summary_keyword);
        if (s.ledger_book_check_keyword) setLedgerBookCheckKeyword(s.ledger_book_check_keyword);
      })
      .catch(() => {});
  }, []);

  const handleToggleDrive = async () => {
    setDriveToggling(true);
    try {
      const next = !driveEnabled;
      await updateSetting('drive_enabled', next);
      setDriveEnabled(next);
    } catch (err) {
      setError('อัปเดต Drive setting ไม่สำเร็จ');
    } finally {
      setDriveToggling(false);
    }
  };

  const handleSaveSearchKeyword = async () => {
    const trimmed = searchKeyword.trim();
    if (!trimmed) return;
    setSearchKeywordSaving(true);
    setSearchKeywordSaved(false);
    try {
      await updateSetting('search_keyword', trimmed);
      setSearchKeywordSaved(true);
    } catch (err) {
      setError('อัปเดตคำสั่งค้นหาไม่สำเร็จ');
    } finally {
      setSearchKeywordSaving(false);
    }
  };

  const handleSaveSummarizeKeyword = async () => {
    const trimmed = summarizeKeyword.trim();
    if (!trimmed) return;
    setSummarizeKeywordSaving(true);
    setSummarizeKeywordSaved(false);
    try {
      await updateSetting('summarize_keyword', trimmed);
      setSummarizeKeywordSaved(true);
    } catch (err) {
      setError('อัปเดตคำสั่งสรุปไม่สำเร็จ');
    } finally {
      setSummarizeKeywordSaving(false);
    }
  };

  // เปิด/ปิดธงต่อกลุ่ม — ใช้ endpoint เดียวรวมทุกฟีเจอร์ใน GROUP_FLAGS (ดูคอมเมนต์บนสุดของไฟล์)
  const handleToggleGroupFlag = async (groupId, field, current) => {
    try {
      await toggleGroupFlag(groupId, field, !current);
      setGroups((prev) =>
        prev.map((g) => g.groupId === groupId ? { ...g, [field]: !current } : g)
      );
    } catch (err) {
      setError('อัปเดตธงกลุ่มไม่สำเร็จ');
    }
  };

  // บันทึก "ชื่ออ้างอิง" (เช่น "พรพล") ของกลุ่มที่เปิดฟีเจอร์เช็คยอดสมุดบัญชี — ใช้ endpoint เดียวกับ
  // ธง boolean ด้านบน (ฝั่ง backend แยก logic ให้เองว่า field นี้เป็น text ไม่ใช่ boolean)
  const handleSaveLedgerReferenceName = async (groupId, value) => {
    const trimmed = value.trim();
    try {
      await toggleGroupFlag(groupId, 'ledgerReferenceName', trimmed);
      setGroups((prev) =>
        prev.map((g) => g.groupId === groupId ? { ...g, ledgerReferenceName: trimmed || null } : g)
      );
    } catch (err) {
      setError('บันทึกชื่ออ้างอิงไม่สำเร็จ');
    }
  };

  const handleSaveReceiptSummaryKeyword = async () => {
    const trimmed = receiptSummaryKeyword.trim();
    if (!trimmed) return;
    setReceiptSummaryKeywordSaving(true);
    setReceiptSummaryKeywordSaved(false);
    try {
      await updateSetting('receipt_summary_keyword', trimmed);
      setReceiptSummaryKeywordSaved(true);
    } catch (err) {
      setError('อัปเดตคำสั่งสรุปบิลไม่สำเร็จ');
    } finally {
      setReceiptSummaryKeywordSaving(false);
    }
  };

  const handleSaveLedgerBookCheckKeyword = async () => {
    const trimmed = ledgerBookCheckKeyword.trim();
    if (!trimmed) return;
    setLedgerBookCheckKeywordSaving(true);
    setLedgerBookCheckKeywordSaved(false);
    try {
      await updateSetting('ledger_book_check_keyword', trimmed);
      setLedgerBookCheckKeywordSaved(true);
    } catch (err) {
      setError('อัปเดตคำสั่งเช็คสมุดไม่สำเร็จ');
    } finally {
      setLedgerBookCheckKeywordSaving(false);
    }
  };

  const handleToggleSearch = async (userId, current) => {
    try {
      await toggleLineUserSearch(userId, !current);
      setLineUsers((prev) =>
        prev.map((u) => u.userId === userId ? { ...u, canSearch: !current } : u)
      );
    } catch (err) {
      setError('อัปเดตสิทธิ์ไม่สำเร็จ');
    }
  };

  const handleCreate = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return;
    try {
      const created = await createUser(newUsername.trim(), newPassword.trim(), newRole, newLineUserId || null);
      setUsers((prev) => [...prev, created]);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      setNewLineUserId('');
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'สร้างไม่สำเร็จ');
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      setNewLineUserId('');
    }
  };

  const handleUpdateLineId = async (userId, lineUserId) => {
    try {
      const updated = await updateUserLineId(userId, lineUserId || null);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, lineUserId: updated.lineUserId, groupIds: updated.groupIds } : u)));
      setSelectedUser((prev) => (prev?.id === userId ? { ...prev, lineUserId: updated.lineUserId, groupIds: updated.groupIds } : prev));
    } catch (err) {
      setError(err.response?.data?.error || 'อัปเดต LINE ID ไม่สำเร็จ');
    }
  };

  const handleUpdateRole = async (userId, role) => {
    if (!confirm(`ยืนยันเปลี่ยน role เป็น "${role}"?`)) return;
    try {
      const updated = await updateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: updated.role } : u)));
      setSelectedUser((prev) => (prev?.id === userId ? { ...prev, role: updated.role } : prev));
    } catch (err) {
      setError(err.response?.data?.error || 'เปลี่ยน role ไม่สำเร็จ');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('ยืนยันลบผู้ใช้นี้?')) return;
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      if (selectedUser?.id === id) setSelectedUser(null);
    } catch (err) {
      setError(err.response?.data?.error || 'ลบไม่สำเร็จ');
    }
  };

  const handleToggleGroup = async (groupId) => {
    if (!selectedUser) return;
    const isOn = selectedUser.groupIds.includes(groupId);
    try {
      if (isOn) {
        await unassignGroupFromUser(selectedUser.id, groupId);
        const updated = { ...selectedUser, groupIds: selectedUser.groupIds.filter((id) => id !== groupId) };
        setSelectedUser(updated);
        setUsers((prev) => prev.map((u) => u.id === selectedUser.id ? updated : u));
      } else {
        await assignGroupToUser(selectedUser.id, groupId);
        const updated = { ...selectedUser, groupIds: [...selectedUser.groupIds, groupId] };
        setSelectedUser(updated);
        setUsers((prev) => prev.map((u) => u.id === selectedUser.id ? updated : u));
      }
    } catch (err) {
      setError(err.response?.data?.error || 'อัปเดตไม่สำเร็จ');
    }
  };

  return (
    <div className="ap-page">
      <div className="ap-header">
        <button className="ap-back" onClick={() => (window.location.href = '/')}>← กลับ</button>
        <h1 className="ap-title">จัดการผู้ใช้</h1>
      </div>

      {error && <div className="ap-error">{error}</div>}

      <div className="ap-body">
        {/* ── ฟอร์มสร้าง user ── */}
        <div className="ap-card">
          <h2 className="ap-card-title">สร้างผู้ใช้ใหม่</h2>
          <div className="ap-form-row">
            <input
              className="ap-input"
              placeholder="Username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              autoComplete="off"
            />
            <input
              className="ap-input"
              placeholder="Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <select
              className="ap-select"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <select
              className="ap-select"
              value={newLineUserId}
              onChange={(e) => setNewLineUserId(e.target.value)}
            >
              <option value="">— ไม่ผูก LINE ID —</option>
              {lineUsers.map((u) => (
                <option key={u.userId} value={u.userId}>{u.displayName || u.userId}</option>
              ))}
            </select>
            <button className="ap-btn-primary" onClick={handleCreate}>สร้าง</button>
          </div>
          <p className="ap-note">
            ผูก LINE ID เพื่อให้ข้อความของคนนี้ขึ้นชิดขวาตอนดูแชท — ต้องให้เขาทักในกลุ่ม/DM มาก่อนอย่างน้อย 1 ครั้ง ถึงจะเลือกได้จากลิสต์นี้
          </p>
        </div>

        <div className="ap-columns">
          {/* ── รายชื่อ user ── */}
          <div className="ap-card ap-card--list">
            <h2 className="ap-card-title">ผู้ใช้ทั้งหมด ({users.length})</h2>
            {loading ? (
              <p className="ap-empty">กำลังโหลด...</p>
            ) : users.length === 0 ? (
              <p className="ap-empty">ยังไม่มีผู้ใช้</p>
            ) : (
              <ul className="ap-user-list">
                {users.map((u) => (
                  <li
                    key={u.id}
                    className={`ap-user-item ${selectedUser?.id === u.id ? 'ap-user-item--active' : ''}`}
                    onClick={() => setSelectedUser(u)}
                  >
                    <div className="ap-user-info">
                      <span className="ap-username">{u.username}</span>
                      <span className={`ap-role-badge ap-role-badge--${u.role}`}>{u.role}</span>
                    </div>
                    <span className="ap-group-count">{u.groupIds.length} กลุ่ม</span>
                    <button
                      className="ap-btn-delete"
                      onClick={(e) => { e.stopPropagation(); handleDelete(u.id); }}
                    >ลบ</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── assign กลุ่ม ── */}
          <div className="ap-card ap-card--groups">
            {selectedUser ? (
              <>
                <h2 className="ap-card-title">
                  กลุ่มของ <span className="ap-highlight">{selectedUser.username}</span>
                </h2>
                {selectedUser.role === 'admin' && (
                  <p className="ap-note">Admin เห็นทุกกลุ่มอยู่แล้ว — ไม่ต้อง assign</p>
                )}
                <div className="ap-form-row">
                  <select
                    className="ap-select"
                    value={selectedUser.role}
                    onChange={(e) => handleUpdateRole(selectedUser.id, e.target.value)}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="superuser">Superuser</option>
                  </select>
                </div>
                <p className="ap-note">
                  Superuser เข้าหน้า "จัดการผู้ใช้" นี้ได้ + ใช้คำสั่ง help ทาง LINE DM ได้ — ให้เฉพาะคนที่ไว้ใจสูงสุดเท่านั้น
                </p>
                <div className="ap-form-row">
                  <select
                    className="ap-select"
                    value={selectedUser.lineUserId || ''}
                    onChange={(e) => handleUpdateLineId(selectedUser.id, e.target.value)}
                  >
                    <option value="">— ไม่ผูก LINE ID —</option>
                    {lineUsers.map((u) => (
                      <option key={u.userId} value={u.userId}>{u.displayName || u.userId}</option>
                    ))}
                  </select>
                </div>
                <p className="ap-note">LINE ID ที่ผูกไว้: {selectedUser.lineUserId || 'ยังไม่ได้ผูก'}</p>
                <ul className="ap-group-list">
                  {groups.map((g) => {
                    const isOn = selectedUser.groupIds.includes(g.groupId);
                    return (
                      <li key={g.groupId} className="ap-group-item">
                        <label className="ap-group-label">
                          <input
                            type="checkbox"
                            checked={isOn}
                            onChange={() => handleToggleGroup(g.groupId)}
                            disabled={selectedUser.role === 'admin'}
                          />
                          <span>{g.groupName}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="ap-empty">เลือกผู้ใช้ทางซ้ายเพื่อ assign กลุ่ม</p>
            )}
          </div>
        </div>
      </div>

      {/* ── System Settings ── */}
      <div className="ap-card ap-settings-card">
        <h2 className="ap-card-title">ตั้งค่าระบบ</h2>
        <div className="ap-setting-row">
          <div className="ap-setting-info">
            <span className="ap-setting-label">Google Drive Upload</span>
            <span className="ap-setting-desc">อัปโหลดไฟล์ไปยัง Google Drive ควบคู่กับ GCS (token หมดทุก 7 วัน)</span>
          </div>
          <button
            className={`ap-toggle${driveEnabled ? ' ap-toggle--on' : ''}`}
            onClick={handleToggleDrive}
            disabled={driveToggling}
          >
            {driveToggling ? '...' : driveEnabled ? 'เปิดอยู่' : 'ปิดอยู่'}
          </button>
        </div>

        <div className="ap-setting-row">
          <div className="ap-setting-info">
            <span className="ap-setting-label">คำสั่งค้นหาไฟล์ผ่าน LINE bot</span>
            <span className="ap-setting-desc">
              พิมพ์คำนี้ตามด้วยคำค้นหาใน DM หรือในกลุ่ม (เช่น "{searchKeyword} สัญญา") — แก้เป็นคำอะไรก็ได้เอง
            </span>
          </div>
          <div className="ap-form-row" style={{ flex: '0 0 auto' }}>
            <input
              className="ap-input"
              style={{ width: 140 }}
              value={searchKeyword}
              onChange={(e) => { setSearchKeyword(e.target.value); setSearchKeywordSaved(false); }}
            />
            <button
              className="ap-btn-primary"
              onClick={handleSaveSearchKeyword}
              disabled={searchKeywordSaving || !searchKeyword.trim()}
            >
              {searchKeywordSaving ? 'กำลังบันทึก...' : searchKeywordSaved ? 'บันทึกแล้ว ✓' : 'บันทึก'}
            </button>
          </div>
        </div>

        <div className="ap-setting-row">
          <div className="ap-setting-info">
            <span className="ap-setting-label">คำสั่งให้ AI สรุปแชทผ่าน LINE bot</span>
            <span className="ap-setting-desc">
              พิมพ์คำนี้เดี่ยวๆ = สรุปวันนี้ | พิมพ์ตามด้วยเลข+"วัน" เช่น "{summarizeKeyword}2วัน" = สรุปย้อนหลัง 2 วัน
              — พิมพ์ในกลุ่มสรุปเฉพาะกลุ่มนั้น พิมพ์ใน DM สรุปทุกกลุ่มที่เป็นสมาชิก
            </span>
          </div>
          <div className="ap-form-row" style={{ flex: '0 0 auto' }}>
            <input
              className="ap-input"
              style={{ width: 140 }}
              value={summarizeKeyword}
              onChange={(e) => { setSummarizeKeyword(e.target.value); setSummarizeKeywordSaved(false); }}
            />
            <button
              className="ap-btn-primary"
              onClick={handleSaveSummarizeKeyword}
              disabled={summarizeKeywordSaving || !summarizeKeyword.trim()}
            >
              {summarizeKeywordSaving ? 'กำลังบันทึก...' : summarizeKeywordSaved ? 'บันทึกแล้ว ✓' : 'บันทึก'}
            </button>
          </div>
        </div>

        <div className="ap-setting-row">
          <div className="ap-setting-info">
            <span className="ap-setting-label">คำสั่งสรุปบิลซื้อของผ่าน LINE bot (OCR)</span>
            <span className="ap-setting-desc">
              พิมพ์คำนี้ในกลุ่มที่เปิดไว้ = เริ่มรวบรวมรูปบิล ส่งรูปได้สูงสุด 10 รูป แล้วพิมพ์คำเดิมอีกครั้ง = ปิด+สรุป
            </span>
          </div>
          <div className="ap-form-row" style={{ flex: '0 0 auto' }}>
            <input
              className="ap-input"
              style={{ width: 140 }}
              value={receiptSummaryKeyword}
              onChange={(e) => { setReceiptSummaryKeyword(e.target.value); setReceiptSummaryKeywordSaved(false); }}
            />
            <button
              className="ap-btn-primary"
              onClick={handleSaveReceiptSummaryKeyword}
              disabled={receiptSummaryKeywordSaving || !receiptSummaryKeyword.trim()}
            >
              {receiptSummaryKeywordSaving ? 'กำลังบันทึก...' : receiptSummaryKeywordSaved ? 'บันทึกแล้ว ✓' : 'บันทึก'}
            </button>
          </div>
        </div>

        <div className="ap-setting-row">
          <div className="ap-setting-info">
            <span className="ap-setting-label">คำสั่ง "เช็คสมุด" ผ่าน LINE bot (เช็คยอดสมุดบัญชี)</span>
            <span className="ap-setting-desc">
              พิมพ์คำนี้ในกลุ่มที่เปิดไว้ แล้วส่งรูปหน้าสมุดบัญชี — ตั้งยอดเริ่มต้น (ครั้งแรก) หรือเทียบยอดกับที่ระบบคำนวณไว้ (ครั้งถัดไป)
            </span>
          </div>
          <div className="ap-form-row" style={{ flex: '0 0 auto' }}>
            <input
              className="ap-input"
              style={{ width: 140 }}
              value={ledgerBookCheckKeyword}
              onChange={(e) => { setLedgerBookCheckKeyword(e.target.value); setLedgerBookCheckKeywordSaved(false); }}
            />
            <button
              className="ap-btn-primary"
              onClick={handleSaveLedgerBookCheckKeyword}
              disabled={ledgerBookCheckKeywordSaving || !ledgerBookCheckKeyword.trim()}
            >
              {ledgerBookCheckKeywordSaving ? 'กำลังบันทึก...' : ledgerBookCheckKeywordSaved ? 'บันทึกแล้ว ✓' : 'บันทึก'}
            </button>
          </div>
        </div>
      </div>

      {/* ── ตั้งค่าเฉพาะกลุ่ม (ธงฟีเจอร์) — ค้นหากลุ่มแล้วเปิด/ปิดได้หลายฟีเจอร์ต่อแถวเดียว ── */}
      <div className="ap-card ap-settings-card">
        <h2 className="ap-card-title">ตั้งค่าเฉพาะกลุ่ม</h2>
        <p className="ap-note">
          ค้นหากลุ่มแล้วเปิด/ปิดฟีเจอร์เฉพาะกลุ่มได้เลย — กลุ่มที่ไม่เปิดธงจะไม่ถูกแตะต้องเลย
          (ตรวจสอบการโอน-ตั้งเบิก: ส่งรูป "รายงานตั้งเบิก" + "สกรีนธนาคาร" 2 รูปติดกัน / สรุปบิลซื้อของ:
          พิมพ์คำสั่งด้านบนแล้วส่งรูปบิล 1-10 รูป)
        </p>
        <input
          type="text"
          className="ap-input ap-group-flag-search"
          placeholder="🔍 ค้นหาชื่อกลุ่ม..."
          value={groupFlagSearch}
          onChange={(e) => setGroupFlagSearch(e.target.value)}
        />
        {(() => {
          const filtered = groups.filter((g) =>
            (g.groupName || '').toLowerCase().includes(groupFlagSearch.trim().toLowerCase())
          );
          if (filtered.length === 0) {
            return <p className="ap-empty">ไม่พบกลุ่มที่ตรงกับคำค้นหา</p>;
          }
          return (
            <ul className="ap-group-list">
              {filtered.map((g) => (
                <li key={g.groupId} className="ap-group-item ap-group-item--flags">
                  <div className="ap-group-flag-identity">
                    {g.pictureUrl ? (
                      <img className="ap-group-flag-avatar ap-group-flag-avatar--img" src={g.pictureUrl} alt="" />
                    ) : (
                      <span className="ap-group-flag-avatar" style={{ background: getColor(g.groupName) }}>
                        {getInitials(g.groupName)}
                      </span>
                    )}
                    <span className="ap-group-flag-name">{g.groupName}</span>
                  </div>
                  <div className="ap-group-flag-chips">
                    {GROUP_FLAGS.map((flag) => (
                      <button
                        key={flag.field}
                        type="button"
                        className={`ap-flag-chip${g[flag.field] ? ' ap-flag-chip--on' : ''}`}
                        onClick={() => handleToggleGroupFlag(g.groupId, flag.field, g[flag.field])}
                      >
                        {flag.label}
                      </button>
                    ))}
                    {g.isLedgerBalanceGroup && (
                      <input
                        key={`${g.groupId}-${g.ledgerReferenceName || ''}`}
                        type="text"
                        className="ap-flag-text-input"
                        placeholder="ชื่ออ้างอิง เช่น พรพล"
                        defaultValue={g.ledgerReferenceName || ''}
                        onBlur={(e) => handleSaveLedgerReferenceName(g.groupId, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          );
        })()}
      </div>

      {/* ── LINE Users: จัดการสิทธิ์ค้นหาผ่าน bot ── */}
      <div className="ap-card ap-line-users-card">
        <h2 className="ap-card-title">สิทธิ์ค้นหาไฟล์ผ่าน LINE Bot</h2>
        <p className="ap-note">เปิดสิทธิ์ให้ user ส่ง "ค้นหา ..." หา bot ใน DM ได้</p>
        {lineUsersLoading ? (
          <p className="ap-empty">กำลังโหลด...</p>
        ) : lineUsers.length === 0 ? (
          <p className="ap-empty">ยังไม่มี LINE user ในระบบ</p>
        ) : (
          <ul className="ap-line-user-list">
            {lineUsers.map((u) => {
              const d = u.inactiveDays;
              const level = d == null ? 'none' : d >= 180 ? 'danger' : d >= 173 ? 'warn' : d >= 150 ? 'caution' : 'safe';
              return (
                <li key={u.userId} className="ap-line-user-item">
                  {u.pictureUrl ? (
                    <img className="ap-line-avatar ap-line-avatar--img" src={u.pictureUrl} alt={u.displayName} />
                  ) : (
                    <div className="ap-line-avatar">{(u.displayName || '?')[0]}</div>
                  )}
                  <div className="ap-line-user-info">
                    <span className="ap-line-name">{u.displayName || '(ไม่มีชื่อ)'}</span>
                    <span className="ap-line-uid">{u.userId}</span>
                  </div>
                  <span className={`ap-inactive-badge ap-inactive-badge--${level}`}>
                    {d == null ? '— วัน' : `${d} วัน`}
                  </span>
                  <button
                    className={`ap-toggle${u.canSearch ? ' ap-toggle--on' : ''}`}
                    onClick={() => handleToggleSearch(u.userId, u.canSearch)}
                  >
                    {u.canSearch ? 'เปิดอยู่' : 'ปิดอยู่'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
