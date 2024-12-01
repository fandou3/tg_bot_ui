const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { loadSession, saveSession } = require('./session');
const config = require('./config');

// 创建图片存储目录
const uploadDir = path.join(__dirname, 'static', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('创建图片目录:', uploadDir);
}

// 创建数据库连接
const dbPath = path.join(__dirname, 'messages.db');
const db = new sqlite3.Database(dbPath);

// 初始化数据库
db.serialize(() => {
    // 创建新表
    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            from_telegram BOOLEAN NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            chat_id TEXT,
            message_id INTEGER,
            chat_name TEXT,
            sender_name TEXT,
            chat_type TEXT,
            is_read BOOLEAN DEFAULT FALSE,
            image_url TEXT,
            access_hash TEXT
        )
    `);

    // 创建置顶表
    db.run(`
        CREATE TABLE IF NOT EXISTS pinned_chats (
            chat_id TEXT PRIMARY KEY,
            pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

let client; // 声明全局 client 变量
let bot;

// 检查是否提供了必要的配置
if (!config.telegramToken && (!config.apiId || !config.apiHash)) {
    console.error('错误: 需要提供 Telegram Token 或 API 凭据');
    process.exit(1);
}

if (config.apiId && config.apiHash) {
    // 如果是用户账号 token，使用 telegram 客户端
    const { TelegramClient } = require('telegram');
    const { StringSession } = require('telegram/sessions');
    const { NewMessage } = require('telegram/events');
    
    const apiId = parseInt(config.apiId);
    const apiHash = config.apiHash;
    
    // 尝试加载保存的会话
    const savedSession = loadSession();
    
    // 创建客户端
    client = new TelegramClient(
        new StringSession(savedSession),
        apiId,
        apiHash,
        {
            connectionRetries: 5,
            useWSS: false,
            requestRetries: 5,
            logger: {
                info: console.log,
                warn: console.warn,
                error: console.error,
                debug: () => {}
            },
            deviceModel: "Desktop",
            systemVersion: "Windows 10",
            appVersion: "1.0.0",
            langCode: "zh"
        }
    );

    // 启动客户端
    (async () => {
        try {
            console.log('正在连接到 Telegram...');
            await client.connect();
            
            // 如果需要登录
            if (!await client.isUserAuthorized()) {
                console.log('需要登录...');
                await client.start({
                    phoneNumber: async () => {
                        return await new Promise((resolve) => {
                            const readline = require('readline').createInterface({
                                input: process.stdin,
                                output: process.stdout
                            });
                            readline.question('请输入手机号 (格式如 +8613800138000): ', (phone) => {
                                readline.close();
                                resolve(phone);
                            });
                        });
                    },
                    password: async () => {
                        return await new Promise((resolve) => {
                            const readline = require('readline').createInterface({
                                input: process.stdin,
                                output: process.stdout
                            });
                            readline.question('请输入两步验证密码 (如果有): ', (password) => {
                                readline.close();
                                resolve(password);
                            });
                        });
                    },
                    phoneCode: async () => {
                        return await new Promise((resolve) => {
                            const readline = require('readline').createInterface({
                                input: process.stdin,
                                output: process.stdout
                            });
                            readline.question('请输入验证码: ', (code) => {
                                readline.close();
                                resolve(code);
                            });
                        });
                    }
                });
                
                // 保存会话字符串
                const sessionString = client.session.save();
                saveSession(sessionString);
                console.log('会话已保存，下次启动将自动登录');
            } else {
                console.log('使用已保存的会话自动登录成功');
            }
            
            // 监听息
            client.addEventHandler(async (event) => {
                try {
                    const message = event.message;
                    
                    // 调试输出
                    console.log('收到原始消息:', {
                        messageId: message?.id,
                        text: message?.message,
                        className: message?.className,
                        media: message?.media?.className,
                        chat: message?.chat,
                        peerId: message?.peerId
                    });

                    // 检查消息是否有效
                    if (!message) {
                        console.log('收到无效消息');
                        return;
                    }

                    // 获取聊天信息
                    let chat;
                    try {
                        const peerId = message.peerId;
                        if (!peerId) {
                            console.error('无法获取聊天ID');
                            return;
                        }
                        
                        // 先获取发送者信
                        let sender;
                        try {
                            sender = message.sender || await message.getSender();
                            if (!sender) {
                                sender = { username: '未知用户', firstName: '未知用户' };
                            }
                        } catch (err) {
                            console.error('获取发送者信息失败:', err);
                            sender = { username: '未知用户', firstName: '未知用户' };
                        }
                        
                        // 根据 peerId 类型处理
                        if (peerId.className === 'PeerUser') {
                            // 对于私聊消息，使用发送者信息构造聊天对象
                            chat = {
                                id: peerId.userId.value,
                                className: 'User',
                                username: sender.username,
                                firstName: sender.firstName,
                                title: sender.firstName || sender.username || '未知用户',
                                accessHash: peerId.accessHash || BigInt(0)
                            };
                        } else {
                            // 其他类型的聊天（群组、频道等）
                            chat = message.chat || await client.getEntity(peerId);
                        }
                        
                        if (!chat) {
                            console.error('无法获取聊天信息');
                            return;
                        }

                        console.log('获取到的聊天信息:', {
                            id: chat.id,
                            type: chat.className,
                            title: chat.title || chat.username || chat.firstName
                        });

                        // 构造消息对象
                        const msg = {
                            text: message.message || '',
                            photo: null,
                            chat: {
                                id: chat.id,
                                type: chat.className === 'Channel' ? 'channel' : 
                                      chat.className === 'User' ? 'private' : 'group',
                                title: chat.title || chat.username || chat.firstName || '未知聊天',
                                accessHash: chat.accessHash || BigInt(0)
                            },
                            from: {
                                username: sender.username || sender.firstName || '未知用户',
                                first_name: sender.firstName || sender.username || '未知用户'
                            },
                            message_id: message.id,
                            date: message.date
                        };

                        console.log('构造的消息对象:', msg);

                        // 检查是否有图片
                        if (message.media && message.media.className === 'MessageMediaPhoto') {
                            try {
                                msg.photo = message.media.photo;
                                console.log('发现图片消息:', msg.photo);
                            } catch (err) {
                                console.error('处理图片信息错误:', err);
                            }
                        }

                        await handleNewMessage(msg);
                    } catch (err) {
                        console.error('获取聊天信息失败:', err);
                        return;
                    }
                } catch (err) {
                    console.error('处理消息错误:', err);
                    console.error(err.stack);
                }
            }, new NewMessage({}));
            
        } catch (err) {
            console.error('连接错误:', err);
        }
    })();
    
    bot = {
        sendMessage: async (chatId, text) => {
            try {
                console.log('准备发送消息到:', chatId);
                
                // 如果是数字字符串，转换为 BigInt
                if (typeof chatId === 'string' && /^\d+$/.test(chatId)) {
                    chatId = BigInt(chatId);
                }

                // 获取所有对话
                const dialogs = await client.getDialogs({});
                console.log('获取到的对话列表数量:', dialogs.length);

                // 查找目标聊天
                const targetDialog = dialogs.find(dialog => {
                    const peer = dialog.entity || dialog.peer;
                    if (!peer) return false;

                    const peerId = peer.id || peer.userId || peer.chatId || peer.channelId;
                    return peerId && peerId.toString() === chatId.toString();
                });

                if (!targetDialog) {
                    console.error('未找到目标聊天:', chatId);
                    throw new Error('未找到目标聊天');
                }

                console.log('找到目标聊天:', {
                    id: targetDialog.entity.id,
                    type: targetDialog.entity.className,
                    title: targetDialog.entity.title || targetDialog.entity.username || targetDialog.entity.firstName
                });

                // 发送消息
                const result = await client.sendMessage(targetDialog.entity, {
                    message: text,
                    parseMode: 'html'
                });

                console.log('消息发送成功:', result);
                return { chat: { id: chatId } };

            } catch (err) {
                console.error('发送消息错误:', err);
                throw err;
            }
        }
    };
}

// 静态文件服务
app.use('/static', express.static(path.join(__dirname, 'static')));

// 渲染主页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// Socket.IO 连接处理
io.on('connection', (socket) => {
    console.log('新用户接');

    // 加载历史消息时包含未读状态和最后一条消息
    db.all(`
        WITH LastMessages AS (
            SELECT chat_id, 
                   text,
                   timestamp,
                   ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY timestamp DESC) as rn
            FROM messages
        )
        SELECT m.chat_id,
               m.chat_name,
               m.chat_type,
               (SELECT COUNT(*) 
                FROM messages 
                WHERE chat_id = m.chat_id 
                AND from_telegram = TRUE 
                AND is_read = FALSE) as unread_count,
               lm.text as last_message,
               lm.timestamp as last_message_time,
               CASE WHEN pc.chat_id IS NOT NULL THEN 1 ELSE 0 END as is_pinned,
               pc.pinned_at
        FROM messages m
        LEFT JOIN LastMessages lm ON m.chat_id = lm.chat_id AND lm.rn = 1
        LEFT JOIN pinned_chats pc ON m.chat_id = pc.chat_id
        GROUP BY m.chat_id
        ORDER BY is_pinned DESC, lm.timestamp DESC
    `, [], (err, rows) => {
        if (err) {
            console.error('加载历史消息错误:', err);
            return;
        }

        // 构建聊天列表数据
        const chats = new Map();
        rows.forEach(row => {
            chats.set(row.chat_id, {
                chatName: row.chat_name,
                chatType: row.chat_type,
                lastMessage: row.last_message || '无消息',
                lastMessageTime: row.last_message_time,
                hasUnread: row.unread_count > 0,
                isPinned: row.is_pinned === 1
            });
        });

        socket.emit('init_chats', Array.from(chats.entries()));
    });

    // 处理消息已读
    socket.on('mark_as_read', (chatId) => {
        db.run(`
            UPDATE messages 
            SET is_read = TRUE 
            WHERE chat_id = ? AND from_telegram = TRUE AND is_read = FALSE
        `, [chatId], (err) => {
            if (err) {
                console.error('更新消息状态错误:', err);
            } else {
                // 广播消息已读状态更新
                io.emit('chat_read', chatId);
            }
        });
    });

    // 处理发送消息
    socket.on('send_message', async (data) => {
        try {
            const chatId = data.activeChatId;
            if (!chatId) {
                throw new Error('没有可回复的聊天ID');
            }
            
            console.log('尝试发送消息到聊天:', {
                chatId: chatId,
                text: data.text
            });
            
            const sent = await bot.sendMessage(chatId, data.text);
            
            // 存储消息
            db.run(`
                INSERT INTO messages (
                    text, 
                    from_telegram, 
                    chat_id, 
                    message_id,
                    chat_name,
                    sender_name,
                    chat_type,
                    access_hash
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.text, 
                false, 
                sent.chat.id.toString(), // 确保是字符串
                sent.message_id || 0,
                sent.chat.title || '你',
                '你',
                sent.chat.className || 'private',
                sent.chat.accessHash ? sent.chat.accessHash.toString() : null
            ]);

            // 确保所有可能的 BigInt 都被转换为字符串
            const safeMsg = {
                text: data.text,
                from: 'user',
                timestamp: new Date(),
                chatId: sent.chat.id.toString(), // 确保是字符串
                chatName: '你',
                senderName: '你',
                chatType: 'private'
            };

            // 广播消息给所有连接的客户端
            io.emit('new_message', safeMsg);
        } catch (error) {
            console.error('发送消息错误:', error);
            socket.emit('send_error', { message: error.message });
        }
    });

    // 在 Socket.IO 连接处理部分添加
    socket.on('get_messages', (chatId) => {
        // 获取指定聊天的消息
        db.all(`
            SELECT * FROM messages 
            WHERE chat_id = ?
            ORDER BY timestamp ASC
        `, [chatId], (err, messages) => {
            if (err) {
                console.error('获取聊天消息错误:', err);
                return;
            }
            socket.emit('chat_messages', messages);
        });
    });

    // 在 Socket.IO 连接处理中添加置顶相关的处理
    socket.on('toggle_pin', (chatId) => {
        db.get('SELECT * FROM pinned_chats WHERE chat_id = ?', [chatId], (err, row) => {
            if (err) {
                console.error('查询置顶状态错误:', err);
                return;
            }

            if (row) {
                // 取消置顶
                db.run('DELETE FROM pinned_chats WHERE chat_id = ?', [chatId], (err) => {
                    if (err) {
                        console.error('取消置顶错误:', err);
                        return;
                    }
                    io.emit('pin_updated', { chatId, isPinned: false });
                });
            } else {
                // 添加置顶
                db.run('INSERT INTO pinned_chats (chat_id) VALUES (?)', [chatId], (err) => {
                    if (err) {
                        console.error('添加置顶错误:', err);
                        return;
                    }
                    io.emit('pin_updated', { chatId, isPinned: true });
                });
            }
        });
    });
});

// 统一的消息处理函数
async function handleNewMessage(msg) {
    // 添加消息有效性检查
    if (!msg || (!msg.text && !msg.photo)) {
        console.log('收到无效消息或不支持的消息类型，已忽略');
        return;
    }

    // 检查 chat 对象是否存在
    if (!msg.chat || !msg.chat.id) {
        console.error('消息缺少必要的聊天信息:', msg);
        return;
    }

    // 检查 from 对象是否存在
    if (!msg.from) {
        msg.from = {
            username: '未知用户',
            first_name: '未知用户'
        };
    }
    
    const text = msg.text || '';
    let imageUrl = '';
    const chatId = msg.chat.id.toString();
    let chatName, senderName;
    
    // 判断消类型（私聊、群聊、频道）
    if (msg.chat.type === 'channel') {
        // 频道消息
        chatName = msg.chat.title || '未知频道';
        senderName = msg.chat.title;
    } else if (msg.chat.type === 'private') {
        // 私聊
        chatName = msg.from.username || msg.from.first_name || '未知用户';
        senderName = chatName;
    } else {
        // 群聊
        chatName = msg.chat.title || '未知群组';
        senderName = msg.from.username || msg.from.first_name || '未知用户';
    }
    
    // 处理图片
    if (msg.photo) {
        try {
            const photo = msg.photo;
            console.log('准备处理图片:', photo);

            const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
            const filePath = path.join(uploadDir, fileName);
            
            console.log('准备下载图片到:', filePath);
            
            if (client) {
                try {
                    // 直接使用 photo 对象下载
                    const buffer = await client.downloadMedia(photo, {
                        outputFile: filePath
                    });
                    
                    if (buffer) {
                        imageUrl = `/static/uploads/${fileName}`;
                        console.log('图片下载成功:', imageUrl);
                    } else {
                        console.error('图片下载失败: 未收到数据');
                    }
                } catch (downloadErr) {
                    console.error('下载图片失败:', downloadErr);
                }
            } else {
                console.error('Telegram 客户端未初始化');
            }
        } catch (err) {
            console.error('处理图片错误:', err);
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    }
    
    // 存储息
    db.run(`
        INSERT INTO messages (
            text, 
            from_telegram, 
            chat_id, 
            message_id, 
            chat_name,
            sender_name,
            chat_type,
            image_url,
            access_hash,
            is_read
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        text, 
        true, 
        chatId,
        msg.message_id, 
        chatName,
        senderName,
        msg.chat.type,
        imageUrl,
        msg.chat.accessHash ? msg.chat.accessHash.toString() : null,
        false  // 新消息默认未读
    ], (err) => {
        if (err) {
            console.error('存储消息错误:', err);
            return;
        }
        
        const safeMsg = {
            text: text,
            from: 'telegram',
            timestamp: new Date(msg.date * 1000),
            chatId: chatId,
            chatName: chatName,
            senderName: senderName,
            chatType: msg.chat.type,
            image_url: imageUrl,
            isRead: false
        };

        io.emit('new_message', safeMsg);
    });
}

// 启动服务器
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});

// 优雅退出
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('关闭数据库错误:', err);
        }
        process.exit(0);
    });
}); 