function initUIEvents() {
    // 发送按钮事件
    sendButton.onclick = sendMessage;
    
    // 清空按钮事件
    clearButton.onclick = () => messageInput.value = '';
    
    // 输入框事件
    messageInput.onkeypress = handleInputKeypress;
}

function showContextMenu(e, chatId, chat) {
    removeExistingContextMenu();
    const menu = createContextMenu(chat);
    positionContextMenu(menu, e);
    addContextMenuEvents(menu, chatId);
}

// 添加图片查看功能
function showFullImage(src) {
    // 移除已存在的全屏图片
    const existingFullscreen = document.querySelector('.fullscreen-image');
    if (existingFullscreen) {
        existingFullscreen.remove();
    }

    const fullscreen = document.createElement('div');
    fullscreen.className = 'fullscreen-image';
    fullscreen.innerHTML = `<img src="${src}" alt="全屏图片">`;
    
    fullscreen.onclick = () => {
        fullscreen.remove();
    };
    
    document.body.appendChild(fullscreen);
}

// 添加相关的 CSS
const style = document.createElement('style');
style.textContent = `
    .fullscreen-image {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        cursor: pointer;
    }

    .fullscreen-image img {
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
    }
`;
document.head.appendChild(style);

// ... 其他 UI 相关函数 ... 