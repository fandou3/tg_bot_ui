const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, 'telegram_session.json');

// 读取会话
function loadSession() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            const data = fs.readFileSync(SESSION_FILE, 'utf8');
            return JSON.parse(data).session || '';
        }
    } catch (err) {
        console.error('读取会话文件错误:', err);
    }
    return '';
}

// 保存会话
function saveSession(session) {
    try {
        fs.writeFileSync(SESSION_FILE, JSON.stringify({ session }));
        console.log('会话已保存到文件');
    } catch (err) {
        console.error('保存会话文件错误:', err);
    }
}

module.exports = {
    loadSession,
    saveSession
}; 