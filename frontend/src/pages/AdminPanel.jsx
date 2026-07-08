import { useState, useEffect } from 'react';
import { fetchUsers, createUser, updateUserLineId, deleteUser, assignGroupToUser, unassignGroupFromUser } from '../api/users';
import { fetchGroups } from '../api/messages';
import { fetchLineUsers, toggleLineUserSearch } from '../api/lineUsers';
import { fetchSettings, updateSetting } from '../api/settings';
import { toggleGroupPaymentVerify } from '../api/paymentVerification';
import './AdminPanel.css';

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

  const handleTogglePaymentVerify = async (groupId, current) => {
    try {
      await toggleGroupPaymentVerify(groupId, !current);
      setGroups((prev) =>
        prev.map((g) => g.groupId === groupId ? { ...g, isPaymentVerifyGroup: !current } : g)
      );
    } catch (err) {
      setError('อัปเดตกลุ่มตรวจสอบการเงินไม่สำเร็จ');
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
                {users.filter((u) => u.role !== 'superuser').map((u) => (
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
      </div>

      {/* ── กลุ่มตรวจสอบการโอน-จ่ายเงิน (OCR) ── */}
      <div className="ap-card ap-settings-card">
        <h2 className="ap-card-title">กลุ่มตรวจสอบการโอนเงิน (OCR)</h2>
        <p className="ap-note">
          เปิดเฉพาะกลุ่มที่จะให้เจ้าหน้าที่ส่งรูป "รายงานตั้งเบิก" + "สกรีนธนาคาร" 2 รูปติดกัน
          เพื่อให้ AI ตรวจสอบยอดอัตโนมัติ — กลุ่มอื่นที่ไม่เปิดจะไม่ถูกแตะต้องเลย
        </p>
        <ul className="ap-group-list">
          {groups.map((g) => (
            <li key={g.groupId} className="ap-group-item">
              <div className="ap-setting-row">
                <span>{g.groupName}</span>
                <button
                  className={`ap-toggle${g.isPaymentVerifyGroup ? ' ap-toggle--on' : ''}`}
                  onClick={() => handleTogglePaymentVerify(g.groupId, g.isPaymentVerifyGroup)}
                >
                  {g.isPaymentVerifyGroup ? 'เปิดอยู่' : 'ปิดอยู่'}
                </button>
              </div>
            </li>
          ))}
        </ul>
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
