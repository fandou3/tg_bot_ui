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

// ... 其他 Socket 事件处理函数 ... 