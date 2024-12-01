function handleNewMessage(msg) {
    if (!activeChat || msg.chatId === activeChat) {
        displayMessage(msg);
    }

    if (msg.from === 'telegram') {
        updateChatWithNewMessage(msg);
    }
}

function displayMessage(msg) {
    if (activeChat && msg.chatId !== activeChat) {
        return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.from}`;
    messageDiv.setAttribute('data-chat-id', msg.chatId);
    
    let content = msg.text;
    if (msg.image_url) {
        content += `<br><img src="${msg.image_url}" alt="图片" onclick="showFullImage('${msg.image_url}')">`;
    }
    
    const senderDisplay = getSenderDisplay(msg);

    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="sender">${senderDisplay}</div>
            ${content}
            <div class="time">${new Date(msg.timestamp).toLocaleString()}</div>
        </div>
    `;
    
    messageContainer.appendChild(messageDiv);
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

function handleChatMessages(messages) {
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
}

function clearMessages() {
    messageContainer.innerHTML = '';
}

function sendMessage() {
    const text = messageInput.value.trim();
    if (text && activeChat) {
        socket.emit('send_message', {
            text: text,
            activeChatId: activeChat
        });
        messageInput.value = '';
    }
}

function getSenderDisplay(msg) {
    return msg.from === 'telegram' 
        ? (msg.chatType === 'channel' 
            ? `📢 ${msg.chatName}`
            : msg.chatType === 'private'
                ? msg.senderName 
                : `${msg.chatName} (${msg.senderName})`)
        : '你';
}

function updateChatWithNewMessage(msg) {
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

// ... 其他消息相关函数 ... 