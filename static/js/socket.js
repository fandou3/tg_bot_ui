function initSocketEvents() {
    // 初始化聊天列表和历史消息
    socket.on('init_chats', (chatData) => {
        chats.clear();
        chatList.innerHTML = '';
        chatData.forEach(([chatId, chat]) => {
            chats.set(chatId, chat);
            updateChatItem(chatId, chat);
        });

        // 加载历史消息
        socket.emit('get_messages');
    });

    // 处理新消息
    socket.on('new_message', (msg) => {
        if (!activeChat || msg.chatId === activeChat) {
            displayMessage(msg);
        }

        if (msg.from === 'telegram') {
            const chat = chats.get(msg.chatId) || {
                chatName: msg.chatName,
                chatType: msg.chatType,
                lastMessage: msg.text,
                hasUnread: msg.chatId !== activeChat
            };
            
            chat.lastMessage = msg.text;
            if (msg.chatId !== activeChat) {
                chat.hasUnread = true;
            }
            
            chats.set(msg.chatId, chat);
            updateChatItem(msg.chatId, chat);
        }
    });

    // 处理聊天消息
    socket.on('chat_messages', (messages) => {
        clearMessages();
        messages.forEach(msg => {
            displayMessage({
                text: msg.text,
                from: msg.from_telegram ? 'telegram' : 'user',
                timestamp: msg.timestamp,
                chatId: msg.chat_id,
                chatName: msg.chat_name,
                senderName: msg.sender_name,
                chatType: msg.chat_type,
                image_url: msg.image_url
            });
        });
        messageContainer.scrollTop = messageContainer.scrollHeight;
    });

    // 处理发送错误
    socket.on('send_error', (error) => {
        alert('发送失败: ' + error.message);
    });

    // 处理已读状态更新
    socket.on('chat_read', (chatId) => {
        const chat = chats.get(chatId);
        if (chat) {
            chat.hasUnread = false;
            updateChatItem(chatId, chat);
        }
    });

    // 处理置顶状态更新
    socket.on('pin_updated', ({ chatId, isPinned }) => {
        const chat = chats.get(chatId);
        if (chat) {
            chat.isPinned = isPinned;
            updateChatItem(chatId, chat);
        }
    });
}

// 发送消息
function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();
    if (!text) return;

    const activeChatId = activeChat;
    if (!activeChatId) {
        alert('请先选择一个聊天');
        return;
    }

    // 创建临时消息元素
    const tempId = 'msg_' + Date.now();
    const messageHtml = `
        <div class="message outgoing" id="${tempId}">
            <div class="message-content">
                <div class="message-text">${text}</div>
                <div class="message-status">
                    <span class="loading">发送中</span>
                </div>
            </div>
        </div>
    `;

    messageContainer.insertAdjacentHTML('beforeend', messageHtml);
    messageContainer.scrollTop = messageContainer.scrollHeight;

    // 清空输入框
    messageInput.value = '';

    // 发送消息
    socket.emit('send_message', {
        text,
        activeChatId
    });

    // 监听发送成功
    socket.once('message_sent', (msg) => {
        if (msg.text === text) {
            updateMessageStatus(tempId, 'success');
            setTimeout(() => {
                const statusElement = document.querySelector(`#${tempId} .message-status`);
                if (statusElement) {
                    statusElement.style.display = 'none';
                }
            }, 2000);
        }
    });

    // 监听发送错误
    socket.once('send_error', (error) => {
        updateMessageStatus(tempId, 'error', error.message);
    });

    // 5秒超时检查
    setTimeout(() => {
        const msgElement = document.getElementById(tempId);
        const statusElement = msgElement?.querySelector('.message-status .loading');
        if (statusElement) {
            updateMessageStatus(tempId, 'error', '发送超时');
        }
    }, 5000);
}

// 更新消息状态
function updateMessageStatus(messageId, status, errorMessage) {
    const msgElement = document.getElementById(messageId);
    if (!msgElement) return;

    const statusElement = msgElement.querySelector('.message-status');
    if (!statusElement) return;

    switch (status) {
        case 'success':
            statusElement.innerHTML = '<span class="success">✓</span>';
            break;
        case 'error':
            statusElement.innerHTML = `<span class="error">发送失败: ${errorMessage}</span>`;
            break;
        default:
            statusElement.innerHTML = `<span class="loading">${status}</span>`;
    }
}

// 添加回车发送功能
document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

document.getElementById('sendButton').addEventListener('click', sendMessage);

// ... 其他 Socket 事件处理函数 ... 

// 在显示消息的函数中添加判断
function displayMessage(msg) {
    const isOutgoing = msg.from === 'user';
    const messageHtml = `
        <div class="message ${isOutgoing ? 'outgoing' : 'incoming'}">
            <div class="message-content">
                ${msg.image_url ? `<img src="${msg.image_url}" class="message-image" onclick="showFullImage('${msg.image_url}')">` : ''}
                <div class="message-text">${msg.text}</div>
            </div>
            <div class="message-info">
                ${!isOutgoing ? `<span class="message-sender">${msg.senderName}</span>` : ''}
                <span class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
                ${isOutgoing ? '<div class="message-status"></div>' : ''}
            </div>
        </div>
    `;
    messageContainer.insertAdjacentHTML('beforeend', messageHtml);
    messageContainer.scrollTop = messageContainer.scrollHeight;
}