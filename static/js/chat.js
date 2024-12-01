function updateChatItem(chatId, chat) {
    let chatItem = document.querySelector(`.chat-item[data-chat-id="${chatId}"]`);
    if (!chatItem) {
        chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.setAttribute('data-chat-id', chatId);
        chatList.appendChild(chatItem);
    }

    const chatIcon = chat.chatType === 'private' ? '👤' : 
                    chat.chatType === 'channel' ? '📢' : '👥';

    chatItem.className = `chat-item ${chat.hasUnread ? 'unread' : ''} ${activeChat === chatId ? 'active' : ''}`;
    chatItem.innerHTML = `
        <div class="chat-item-username">
            ${chatIcon} ${chat.chatName}
            ${chat.hasUnread ? '<span class="unread-badge"></span>' : ''}
        </div>
        <div class="chat-item-preview">${chat.lastMessage || ''}</div>
    `;

    // 添加右键菜单
    chatItem.oncontextmenu = (e) => {
        e.preventDefault();
        showContextMenu(e, chatId, chat);
    };

    chatItem.onclick = () => {
        handleChatItemClick(chatItem, chatId, chat, chatIcon);
    };
}

function handleChatItemClick(chatItem, chatId, chat, chatIcon) {
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    
    chatItem.classList.add('active');
    chatItem.classList.remove('unread');
    activeChat = chatId;
    currentChat.textContent = `${chatIcon} ${chat.chatName}`;

    clearMessages();

    if (chat.hasUnread) {
        socket.emit('mark_as_read', chatId);
        chat.hasUnread = false;
        updateChatItem(chatId, chat);
    }

    socket.emit('get_messages', chatId);
}

// ... 其他聊天相关函数 ... 