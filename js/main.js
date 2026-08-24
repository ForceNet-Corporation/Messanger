import {
    auth, db, storage,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
    onAuthStateChanged, updateProfile,
    collection, addDoc, query, orderBy, onSnapshot, doc, getDoc,
    setDoc, updateDoc, deleteDoc, where, getDocs, serverTimestamp,
    ref, uploadBytes, getDownloadURL, deleteObject
} from '../firebase-config.js';

let currentUser = null;
let currentUserData = null;
let currentChatId = null;
let messagesUnsubscribe = null;
let allUsers = [];

const loginPage = document.getElementById('loginPage');
const registerPage = document.getElementById('registerPage');
const chatPage = document.getElementById('chatPage');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const registerName = document.getElementById('registerName');
const registerEmail = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const registerGender = document.getElementById('registerGender');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');
const chatList = document.getElementById('chatList');
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');
const userAvatar = document.getElementById('userAvatar');
const userNameDisplay = document.getElementById('userNameDisplay');
const chatAvatar = document.getElementById('chatAvatar');
const chatUserName = document.getElementById('chatUserName');
const profileModal = document.getElementById('profileModal');
const profileAvatar = document.getElementById('profileAvatar');
const profileName = document.getElementById('profileName');
const profileId = document.getElementById('profileId');
const profileEmail = document.getElementById('profileEmail');
const themeSelect = document.getElementById('themeSelect');

window.showRegister = function() {
    loginPage.classList.remove('active');
    registerPage.classList.add('active');
    loginError.textContent = '';
};

window.showLogin = function() {
    registerPage.classList.remove('active');
    loginPage.classList.add('active');
    registerError.textContent = '';
};

window.toggleProfile = function() {
    if (currentUser && currentUserData) {
        profileName.value = currentUserData.name || '';
        profileId.value = currentUser.uid;
        profileEmail.value = currentUser.email;
        profileAvatar.textContent = (currentUserData.name || 'U')[0].toUpperCase();
        const savedTheme = localStorage.getItem('theme') || 'light';
        themeSelect.value = savedTheme;
        profileModal.classList.add('show');
    }
};

window.closeProfile = function() {
    profileModal.classList.remove('show');
};

window.saveProfile = function() {
    const newName = profileName.value.trim();
    if (newName && currentUser) {
        updateProfile(currentUser, { displayName: newName });
        updateDoc(doc(db, 'users', currentUser.uid), { name: newName });
        currentUserData.name = newName;
        userAvatar.textContent = newName[0].toUpperCase();
        userNameDisplay.textContent = newName;
        closeProfile();
    }
};

window.changeTheme = function(theme) {
    document.body.className = 'theme-' + theme;
    localStorage.setItem('theme', theme);
};

window.toggleSidebar = function() {
    document.getElementById('chatSidebar').classList.toggle('open');
};

window.logout = function() {
    signOut(auth);
    closeProfile();
};

window.searchUsers = function(query) {
    if (!query.trim()) {
        renderChatList(allUsers);
        return;
    }
    const filtered = allUsers.filter(u => 
        u.name && u.name.toLowerCase().includes(query.toLowerCase())
    );
    renderChatList(filtered);
};

window.handleEnter = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
};

window.autoResize = function(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
};

window.sendMessage = function() {
    const text = messageInput.value.trim();
    if (!text || !currentChatId) return;
    
    addDoc(collection(db, 'messages'), {
        text: text,
        senderId: currentUser.uid,
        senderName: currentUserData.name || 'User',
        chatId: currentChatId,
        timestamp: serverTimestamp(),
        type: 'text'
    });
    
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;
    setTimeout(() => sendBtn.disabled = false, 100);
};

window.handleFileUpload = function(files) {
    if (!files.length || !currentChatId) return;
    
    for (const file of files) {
        const fileRef = ref(storage, 'uploads/' + Date.now() + '_' + file.name);
        uploadBytes(fileRef, file).then(snapshot => {
            return getDownloadURL(snapshot.ref);
        }).then(url => {
            let type = 'file';
            if (file.type.startsWith('image/')) type = 'image';
            else if (file.type.startsWith('audio/')) type = 'audio';
            else if (file.type.startsWith('video/')) type = 'video';
            
            return addDoc(collection(db, 'messages'), {
                text: file.name,
                senderId: currentUser.uid,
                senderName: currentUserData.name || 'User',
                chatId: currentChatId,
                timestamp: serverTimestamp(),
                type: type,
                fileUrl: url,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type
            });
        }).catch(err => {
            console.error('Upload error:', err);
        });
    }
};

window.clearChat = function() {
    if (!currentChatId || !confirm('Очистить все сообщения в этом чате?')) return;
    
    const q = query(collection(db, 'messages'), where('chatId', '==', currentChatId));
    getDocs(q).then(snapshot => {
        snapshot.docs.forEach(doc => deleteDoc(doc.ref));
    });
};

function renderChatList(users) {
    if (!users || !users.length) {
        chatList.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Нет пользователей</div>';
        return;
    }
    
    chatList.innerHTML = users.map(user => {
        const isActive = user.uid === currentChatId;
        return `
            <div class="chat-item ${isActive ? 'active' : ''}" onclick="selectChat('${user.uid}')">
                <div class="avatar">${(user.name || 'U')[0].toUpperCase()}</div>
                <div class="chat-info">
                    <div class="chat-name">${user.name || 'Неизвестный'}</div>
                    <div class="chat-preview">${user.status || 'Онлайн'}</div>
                </div>
            </div>
        `;
    }).join('');
}

window.selectChat = function(userId) {
    if (userId === currentUser.uid) return;
    
    currentChatId = userId;
    const user = allUsers.find(u => u.uid === userId);
    
    if (user) {
        chatAvatar.textContent = (user.name || 'U')[0].toUpperCase();
        chatUserName.textContent = user.name || 'Неизвестный';
    }
    
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const items = document.querySelectorAll('.chat-item');
    items.forEach(el => {
        if (el.textContent.includes(user?.name || '')) {
            el.classList.add('active');
        }
    });
    
    if (messagesUnsubscribe) {
        messagesUnsubscribe();
        messagesUnsubscribe = null;
    }
    
    loadMessages(userId);
    
    if (window.innerWidth <= 768) {
        document.getElementById('chatSidebar').classList.remove('open');
    }
};

function loadMessages(chatId) {
    const q = query(
        collection(db, 'messages'),
        where('chatId', '==', chatId),
        orderBy('timestamp', 'asc')
    );
    
    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
        messagesArea.innerHTML = '';
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const isOwn = data.senderId === currentUser.uid;
            const time = data.timestamp?.toDate?.() || new Date();
            const timeStr = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            
            let fileHtml = '';
            if (data.fileUrl) {
                if (data.type === 'image') {
                    fileHtml = `<img src="${data.fileUrl}" class="msg-image" onclick="window.open('${data.fileUrl}')">`;
                } else if (data.type === 'audio') {
                    fileHtml = `<audio controls class="msg-audio"><source src="${data.fileUrl}"></audio>`;
                } else if (data.type === 'video') {
                    fileHtml = `<video controls class="msg-video"><source src="${data.fileUrl}"></video>`;
                } else {
                    fileHtml = `<a href="${data.fileUrl}" target="_blank" class="msg-file">${data.text || 'Файл'}</a>`;
                }
            }
            
            const messageHtml = `
                <div class="message ${isOwn ? 'own' : 'other'}">
                    ${!isOwn ? `<div class="msg-sender">${data.senderName || 'Пользователь'}</div>` : ''}
                    ${data.type === 'text' || data.type === 'file' && !data.fileUrl ? 
                        `<div class="msg-text">${data.text || ''}</div>` : ''}
                    ${fileHtml}
                    <div class="msg-time">${timeStr}</div>
                </div>
            `;
            
            messagesArea.innerHTML += messageHtml;
        });
        
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
}

function loadUsers() {
    const usersRef = collection(db, 'users');
    onSnapshot(usersRef, (snapshot) => {
        allUsers = [];
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (doc.id !== currentUser.uid) {
                allUsers.push({
                    uid: doc.id,
                    ...data
                });
            }
        });
        renderChatList(allUsers);
    });
}

function loadTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.body.className = 'theme-' + saved;
    themeSelect.value = saved;
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    
    try {
        const userCredential = await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
        loginForm.reset();
    } catch (err) {
        loginError.textContent = err.message;
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.textContent = '';
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, registerEmail.value, registerPassword.value);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName: registerName.value });
        
        await setDoc(doc(db, 'users', user.uid), {
            name: registerName.value,
            email: registerEmail.value,
            gender: registerGender.value,
            createdAt: serverTimestamp()
        });
        
        registerForm.reset();
    } catch (err) {
        registerError.textContent = err.message;
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            currentUserData = userDoc.data();
        } else {
            currentUserData = { name: user.displayName || 'User' };
        }
        
        userAvatar.textContent = (currentUserData.name || 'U')[0].toUpperCase();
        userNameDisplay.textContent = currentUserData.name || 'Пользователь';
        
        loginPage.classList.remove('active');
        registerPage.classList.remove('active');
        chatPage.classList.add('active');
        document.querySelector('.container')?.classList.add('active');
        
        loadUsers();
        loadTheme();
    } else {
        currentUser = null;
        currentUserData = null;
        currentChatId = null;
        
        if (messagesUnsubscribe) {
            messagesUnsubscribe();
            messagesUnsubscribe = null;
        }
        
        chatPage.classList.remove('active');
        loginPage.classList.add('active');
        registerPage.classList.remove('active');
        chatList.innerHTML = '';
        messagesArea.innerHTML = '';
    }
});

sendBtn.addEventListener('click', sendMessage);

loadTheme();

console.log('ForceNet запущен!');
