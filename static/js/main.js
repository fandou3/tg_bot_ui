// DOM 元素
const messageContainer = document.getElementById('messageContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const clearButton = document.getElementById('clearButton');
const chatList = document.getElementById('chatList');
const currentChat = document.getElementById('currentChat');

// 全局变量
const socket = io();
let activeChat = null;
let chats = new Map();

document.addEventListener('DOMContentLoaded', () => {
    // 初始化事件监听
    initSocketEvents();
    initUIEvents();
}); 