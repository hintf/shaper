const OpenAI = require('openai');
const WebSocket = require('ws');
const dotenv = require('dotenv');

// Импорты модулей
const RevoltAPI = require('./utils/revoltAPI');
const MessageManager = require('./utils/messageManager');
const ShaperHandler = require('./handlers/shaperHandler');
const MessageHandler = require('./handlers/messageHandler');

// Загрузка переменных окружения
dotenv.config({ path: '/home/user/.../.env' });

// Проверка обязательных переменных
if (!process.env.SHAPESINC_API_KEY) {
  throw new Error('SHAPESINC_API_KEY is not defined in .env file');
}
if (!process.env.REVOLT_TOKEN) {
  throw new Error('REVOLT_TOKEN is not defined in .env file');
}
if (!process.env.BOT_OWNER_ID) {
  throw new Error('BOT_OWNER_ID is not defined in .env file');
}

// Конфигурация
const token = process.env.REVOLT_TOKEN;
const apiKey = process.env.SHAPESINC_API_KEY;
const botOwnerId = process.env.BOT_OWNER_ID;

// Загрузка доступных Shapes из .env
const availableShapes = {};
for (let i = 1; i <= 10; i++) {
  const shapeKey = `SHAPESINC_SHAPE_USERNAME_${i}`;
  if (process.env[shapeKey]) {
    availableShapes[i] = process.env[shapeKey];
  }
}

if (Object.keys(availableShapes).length === 0) {
  throw new Error('No SHAPESINC_SHAPE_USERNAME_* variables found in .env file');
}

console.log('Available Shapes:', availableShapes);

// Инициализация компонентов
const revoltAPI = new RevoltAPI(token);
const messageManager = new MessageManager(revoltAPI);
const shaperHandler = new ShaperHandler(revoltAPI, messageManager, availableShapes);
const messageHandler = new MessageHandler(revoltAPI, messageManager, shaperHandler, availableShapes, apiKey, botOwnerId);

// Информация о боте
let botId = null;
let botUsername = null;
let pingInterval = null;
let socket = null;

// Функция для отправки ping
function sendPing() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    console.log('Sending ping to server...');
    socket.send(JSON.stringify({
      type: 'Ping',
      content: Date.now() // Отправляем текущее время как содержимое ping
    }));
  }
}

// Функция для настройки heartbeat
function setupHeartbeat() {
  // Очищаем предыдущий интервал, если он есть
  if (pingInterval) {
    clearInterval(pingInterval);
  }
  
  // Отправляем ping каждые 20 секунд (рекомендуется 10-30 секунд)
  pingInterval = setInterval(sendPing, 20000);
}

// Функция для очистки heartbeat
function clearHeartbeat() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

// Основная функция бота
async function startBot() {
  try {
    // Получаем информацию о боте
    const { data: self } = await revoltAPI.get('/users/@me');
    
    botId = self._id;
    botUsername = self.username;
    console.log(`Logged in as ${botUsername} (${botId})`);
    
    // Подключаемся к WebSocket
    socket = new WebSocket('wss://ws.revolt.chat');
    
    socket.on('open', () => {
      console.log('Connected to Revolt WebSocket');
      socket.send(JSON.stringify({
        type: 'Authenticate',
        token: token
      }));
    });
    
    socket.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        
        if (message.type === 'Ready') {
          console.log('Bot is ready to receive messages');
          // Запускаем heartbeat после успешного подключения
          setupHeartbeat();
        }
        
        // Обрабатываем Pong ответы от сервера
        if (message.type === 'Pong') {
          console.log('Received pong from server');
          return;
        }
        
        // Если сервер отправляет Ping (редко, но может быть)
        if (message.type === 'Ping') {
          console.log('Received ping from server, sending pong...');
          socket.send(JSON.stringify({
            type: 'Pong',
            content: message.content
          }));
          return;
        }
        
        if (message.type === 'Message') {
          await messageHandler.handleMessage(message, botId);
        }
        
        if (message.type === 'MessageReact') {
          // Обработка реакций для выбора персонажа
          if (message.user_id === botId) return;
          
          let emoji = message.emoji_id || message.emoji || message.id;
          if (!emoji) return;
          
          const channelId = message.channel_id || message.channel;
          const messageId = message.message_id || message.id;

          await shaperHandler.handleShapeSelection(channelId, emoji, message.user_id, botId);
        }
        
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    });
    
    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      clearHeartbeat();
    });
    
    socket.on('close', (code, reason) => {
      console.log(`WebSocket connection closed: ${code} - ${reason}`);
      clearHeartbeat();
      console.log('Reconnecting in 5 seconds...');
      setTimeout(startBot, 5000);
    });
    
  } catch (error) {
    console.error('Error starting bot:', error.message);
    clearHeartbeat();
    console.log('Retrying in 10 seconds...');
    setTimeout(startBot, 10000);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  clearHeartbeat();
  if (socket) {
    socket.close();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  clearHeartbeat();
  if (socket) {
    socket.close();
  }
  process.exit(0);
});

// Запуск бота
console.log('Starting bot...');
startBot();
