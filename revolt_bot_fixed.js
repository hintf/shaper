const OpenAI = require('openai');
const WebSocket = require('ws');
const EventEmitter = require('events');
const dotenv = require('dotenv');
const https = require('https');

// Глобальный кеш последних сообщений бота (максимум 100)
const recentBotMessages = new Set();

// Кеш аватаров для Shape'ов
const avatarCache = new Map();

// Текущий активный Shape для каждого канала
const activeShapes = new Map();

// Load environment variables
dotenv.config({ path: '/home/hintf/bots/revolt/shape-revolt/.env' }); //change to your device/host path

// Validate environment variables
if (!process.env.SHAPESINC_API_KEY) {
  throw new Error('SHAPESINC_API_KEY is not defined in .env file');
}
if (!process.env.REVOLT_TOKEN) {
  throw new Error('REVOLT_TOKEN is not defined in .env file');
}

// Configuration
const token = process.env.REVOLT_TOKEN;
const apiKey = process.env.SHAPESINC_API_KEY;
const REVOLT_API_URL = 'https://api.revolt.chat';
const REVOLT_SERVER_URL = process.env.REVOLT_SERVER_URL || 'https://autumn.revolt.chat';

// Загружаем доступные Shapes из .env
const availableShapes = {};
for (let i = 1; i <= 10; i++) {
  const shapeKey = `SHAPESINC_SHAPE_USERNAME_${i}`;
  if (process.env[shapeKey]) {
    availableShapes[i] = process.env[shapeKey];
  }
}

// Проверяем, что хотя бы один Shape настроен
if (Object.keys(availableShapes).length === 0) {
  throw new Error('No SHAPESINC_SHAPE_USERNAME_* variables found in .env file. Please define at least SHAPESINC_SHAPE_USERNAME_1');
}

// Настройки персонажей - эмодзи, названия и цвета
const shapeConfig = {
  1: { emoji: '🐱', name: 'Кот-Сказитель', colour: '#FF6B6B' },
  2: { emoji: '🐿️', name: 'Белочка', colour: '#4ECDC4' },
  3: { emoji: '🐕', name: 'Пёсель', colour: '#45B7D1' },
  4: { emoji: '🦝', name: 'Енот', colour: '#96CEB4' },
  5: { emoji: '🌌', name: 'Старик', colour: '#FFEAA7' },
  6: { emoji: '🧠', name: 'Дей', colour: '#DDA0DD' }
};

console.log('Available Shapes:', availableShapes);
console.log('Shape Config:', shapeConfig);

// Проверяем соответствие между availableShapes и shapeConfig
for (const shapeId of Object.keys(availableShapes)) {
  if (!shapeConfig[shapeId]) {
    console.warn(`Warning: Shape ${shapeId} (${availableShapes[shapeId]}) has no configuration in shapeConfig`);
  }
}

// Set up the Shapes API client
const shapes = new OpenAI({
  apiKey: apiKey,
  baseURL: 'https://api.shapes.inc/v1',
});

// Bot information
let botId = null;
let botUsername = null;

// Create event emitter for custom events
const events = new EventEmitter();

// Initialize HTTP client for Revolt API
const revoltAPI = {
  get(endpoint) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.revolt.chat',
        path: endpoint,
        method: 'GET',
        headers: {
          'x-bot-token': token
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ data: JSON.parse(data) });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  },

  post(endpoint, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const options = {
        hostname: 'api.revolt.chat',
        path: endpoint,
        method: 'POST',
        headers: {
          'x-bot-token': token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };
  
      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve({ data: JSON.parse(responseData) });
            } catch (error) {
              reject(new Error(`Failed to parse response: ${responseData}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });
  
      req.on('error', (error) => {
        reject(error);
      });
  
      req.write(data);
      req.end();
    });
  },

  put(endpoint, body) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : '';
      const options = {
        hostname: 'api.revolt.chat',
        path: endpoint,
        method: 'PUT',
        headers: {
          'x-bot-token': token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };
  
      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve({ data: responseData ? JSON.parse(responseData) : {} });
            } catch (error) {
              resolve({ data: {} });
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });
  
      req.on('error', (error) => {
        reject(error);
      });
  
      if (data) {
        req.write(data);
      }
      req.end();
    });
  }
};

// Функция для получения аватара Shape'а
async function getShapeAvatar(shapeUsername) {
  if (avatarCache.has(shapeUsername)) {
    return avatarCache.get(shapeUsername);
  }

  try {
    console.log(`Fetching avatar for shape: ${shapeUsername}`);
    const response = await shapes.chat.completions.create({
      model: `shapesinc/${shapeUsername}`,
      messages: [{ role: "user", content: "Hi" }],
      temperature: 0.7,
      max_tokens: 1
    });

    // Попытаемся получить аватар через API (может быть в response.model или другом поле)
    // Если прямого способа нет, используем общий аватар
    const avatarUrl = `https://api.shapes.inc/v1/shapes/${shapeUsername}/avatar` || 
                      `https://api.dicebear.com/7.x/adventurer/svg?seed=${shapeUsername}`;
    
    avatarCache.set(shapeUsername, avatarUrl);
    return avatarUrl;
  } catch (error) {
    console.error(`Error getting avatar for ${shapeUsername}:`, error.message);
    // Fallback аватар
    const fallbackAvatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${shapeUsername}`;
    avatarCache.set(shapeUsername, fallbackAvatar);
    return fallbackAvatar;
  }
}

// Функция для установки маскарада
async function setMasquerade(channelId, shapeId) {
  try {
    const shapeUsername = availableShapes[shapeId];
    const config = shapeConfig[shapeId];
    
    if (!shapeUsername || !config) {
      console.error(`Invalid shape ID: ${shapeId}`);
      return false;
    }

    const avatar = await getShapeAvatar(shapeUsername);
    
    const masquerade = {
      name: config.name,
      avatar: avatar,
      colour: config.colour
    };

    console.log(`Setting masquerade for channel ${channelId}:`, masquerade);
    
    // Устанавливаем активный Shape для канала
    activeShapes.set(channelId, shapeId);
    
    return masquerade;
  } catch (error) {
    console.error('Error setting masquerade:', error.message);
    return false;
  }
}

// ИСПРАВЛЕННАЯ функция для добавления реакций к сообщению
async function addReaction(channelId, messageId, emoji) {
  try {
    if (!emoji) {
      console.error('Emoji is undefined or empty');
      return;
    }
    
    // Правильное кодирование эмодзи для Revolt API
    const encodedEmoji = encodeURIComponent(emoji);
    
    console.log(`Adding reaction ${emoji} (encoded: ${encodedEmoji}) to message ${messageId} in channel ${channelId}`);
    
    // Revolt API endpoint для добавления реакции
    const endpoint = `/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}`;
    
    await revoltAPI.put(endpoint);
    console.log(`Successfully added reaction ${emoji}`);
  } catch (error) {
    console.error(`Error adding reaction ${emoji}:`, error.message);
    
    // Дополнительная отладка
    if (error.message.includes('string')) {
      console.error('This looks like an encoding issue. Emoji value:', JSON.stringify(emoji));
      console.error('Emoji type:', typeof emoji);
      console.error('Emoji length:', emoji ? emoji.length : 'undefined');
    }
  }
}

// Helper function to send a message to a channel
async function sendMessage(channelId, content, masquerade = null) {
  try {
    const MAX_LENGTH = 1000;
    
    const messageBody = { content };
    if (masquerade) {
      messageBody.masquerade = masquerade;
    }
    
    if (content.length <= MAX_LENGTH) {
      const response = await revoltAPI.post(`/channels/${channelId}/messages`, messageBody);
      // Сохраняем ID отправленного сообщения
      if (response.data && response.data._id) {
        recentBotMessages.add(response.data._id);
        if (recentBotMessages.size > 100) recentBotMessages.delete([...recentBotMessages][0]);
      }
      return response.data;
    } else {
      // Split long messages into chunks
      const chunks = [];
      let currentChunk = '';
      const paragraphs = content.split('\n\n'); // Split by paragraphs

      for (const paragraph of paragraphs) {
        if (currentChunk.length + paragraph.length + 2 <= MAX_LENGTH) {
          // Add paragraph to current chunk
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        } else {
          // Save current chunk and start a new one
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = paragraph;
          // Handle oversized paragraphs
          while (currentChunk.length > MAX_LENGTH) {
            let splitPoint = currentChunk.lastIndexOf(' ', MAX_LENGTH);
            if (splitPoint === -1) splitPoint = MAX_LENGTH;
            chunks.push(currentChunk.slice(0, splitPoint));
            currentChunk = currentChunk.slice(splitPoint).trim();
          }
        }
      }
      // Add the final chunk
      if (currentChunk) chunks.push(currentChunk);

      // Send each chunk as a separate message
      for (const chunk of chunks) {
        const chunkBody = { content: chunk };
        if (masquerade) {
          chunkBody.masquerade = masquerade;
        }
        
        const response = await revoltAPI.post(`/channels/${channelId}/messages`, chunkBody);
        // Сохраняем ID каждого чанка
        if (response.data && response.data._id) {
          recentBotMessages.add(response.data._id);
          if (recentBotMessages.size > 100) recentBotMessages.delete([...recentBotMessages][0]);
        }
      }
      return { message: 'All chunks sent' };
    }
  } catch (error) {
    console.error('Error sending message:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
  }
}

// Функция для обработки команды !shaper
async function handleShaperCommand(channelId) {
  try {
    let message = "🎭 **Выберите персонажа:**\n\n";
    
    const availableShapeIds = Object.keys(availableShapes);
    for (const shapeId of availableShapeIds) {
      const config = shapeConfig[shapeId];
      if (config) {
        message += `${config.emoji} - ${config.name}\n`;
      }
    }
    
    message += "\n*Нажмите на реакцию, чтобы выбрать персонажа*";
    
    const sentMessage = await sendMessage(channelId, message);
    
    if (sentMessage && sentMessage._id) {
      // Добавляем реакции для выбора
      console.log('Adding reactions to message:', sentMessage._id);
      for (const shapeId of availableShapeIds) {
        const config = shapeConfig[shapeId];
        if (config && config.emoji) {
          console.log(`Adding reaction for shape ${shapeId}: ${config.emoji}`);
          await addReaction(channelId, sentMessage._id, config.emoji);
          // Небольшая задержка между реакциями
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          console.warn(`No config found for shape ${shapeId}`);
        }
      }
    } else {
      console.error('Failed to get message ID for reactions');
    }
    
    return sentMessage;
  } catch (error) {
    console.error('Error handling shaper command:', error.message);
    await sendMessage(channelId, "❌ Ошибка при обработке команды выбора персонажа.");
  }
}

/**
 * Process attachments from a message to extract image or audio URLs
 * @param {Array} attachments - Array of attachment objects from Revolt
 * @returns {Object|null} - Object with image and/or audio URLs, or null if none found
 */
function processAttachments(attachments) {
  if (!attachments || attachments.length === 0) return null;
  
  const result = {};
  
  for (const attachment of attachments) {
    // Log attachment information for debugging
    console.log('Processing attachment:', JSON.stringify(attachment, null, 2));
    
    // Get the URL from the attachment
    let url = '';
    
    // Handle different attachment structures from Revolt
    if (attachment.url) {
      url = attachment.url;
    } else if (attachment._id || attachment.id) {
      // Construct URL based on ID
      const attachmentId = attachment._id || attachment.id;
      url = `${REVOLT_SERVER_URL}/attachments/${attachmentId}`;
    } else if (typeof attachment === 'string' && attachment.includes('/')) {
      // Handle if attachment is directly a URL string
      url = attachment;
    }
    
    // Ensure URL is properly encoded if needed
    if (url && !url.startsWith('http')) {
      url = `https://${url}`;
    }
    
    console.log('Resolved attachment URL:', url);
    
    if (!url) continue;
    
    // Check attachment type
    const contentType = attachment.content_type || '';
    if (contentType.startsWith('image/') || 
        url.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
      result.image = url;
      console.log('Found image attachment:', url);
    } else if (contentType.startsWith('audio/') || 
              contentType === 'audio/mpeg' || 
              contentType === 'audio/mp3' ||
              contentType === 'audio/ogg' ||
              url.match(/\.(mp3|wav|ogg|m4a)$/i)) {
      result.audio = url;
      console.log('Found audio attachment:', url);
    }
  }
  
  // If no valid attachments found, return null
  if (!result.image && !result.audio) {
    return null;
  }
  
  console.log('Final attachments object:', JSON.stringify(result));
  return result;
}

// Main bot function
async function startBot() {
  try {
    // Get bot info first
    const { data: self } = await revoltAPI.get('/users/@me');
    
    botId = self._id;
    botUsername = self.username;
    console.log(`Logged in as ${botUsername} (${botId})`);
    
    // Connect using the WebSocket URL for bots
    const socket = new WebSocket('wss://ws.revolt.chat');
    
    socket.on('open', () => {
      console.log('Connected to Revolt WebSocket');
      // Authenticate with bot token
      socket.send(JSON.stringify({
        type: 'Authenticate',
        token: token
      }));
    });
    
    socket.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        console.log('Received message:', message.type);
        
        if (message.type === 'Ready') {
          console.log('Bot is ready to receive messages');
        }
        
        if (message.type === 'Message') {
          // Ignore our own messages
          if (message.author === botId) return;
          
          console.log('Message received:', message.content);
          
          // Проверяем команду !shaper
          if (message.content && message.content.trim() === '!shaper') {
            await handleShaperCommand(message.channel);
            return;
          }
          
          // Get channel details to check if it's a DM
          let isDM = false;
          try {
            const { data: channelData } = await revoltAPI.get(`/channels/${message.channel}`);
            isDM = channelData.channel_type === 'DirectMessage';
            console.log('Channel type:', channelData.channel_type, 'isDM:', isDM);
          } catch (err) {
            console.error('Error checking channel type:', err.message);
          }
          
          // Check if bot is mentioned or if it's a DM
          const isMentioned = message.content && message.content.includes(`<@${botId}>`);
          const hasAttachments = message.attachments && message.attachments.length > 0;
		  
		  // Добавить проверку ответа:
			let isReplyToBot = false;
			if (message.replies && message.replies.length > 0) {
			isReplyToBot = message.replies.some(id => recentBotMessages.has(id));
			console.log(`Ответ боту: ${isReplyToBot}`);
			}
          
          if (isMentioned || isDM || isReplyToBot) {
            console.log(isDM ? 'Message is in DM' : 'Bot was mentioned!');
            try {
              // Remove the mention from the message if present
              let content = message.content || '';
              if (isMentioned) {
                content = content.replace(new RegExp(`<@${botId}>`, 'g'), '').trim();
              }
              
              // Process any attachments
              const attachments = hasAttachments ? processAttachments(message.attachments) : null;
              
              // Handle empty messages differently if there are attachments
              if (!content && !attachments) {
                const masquerade = activeShapes.has(message.channel) ? 
                  await setMasquerade(message.channel, activeShapes.get(message.channel)) : null;
                await sendMessage(message.channel, "Hello! How can I help you today?", masquerade);
                return;
              }
              
              // If we have no text but have attachments, use a generic prompt
              if (!content && attachments) {
                content = "Please describe this";
              }
              
              console.log('Sending to Shapes API...');
              
              // Определяем какой Shape использовать
              const activeShapeId = activeShapes.get(message.channel);
              let shapeUsername;
              
              if (activeShapeId && availableShapes[activeShapeId]) {
                shapeUsername = availableShapes[activeShapeId];
                console.log(`Using active shape: ${shapeUsername} (ID: ${activeShapeId})`);
              } else {
                // Используем первый доступный Shape как default
                const firstShapeId = Object.keys(availableShapes)[0];
                shapeUsername = availableShapes[firstShapeId];
                console.log(`Using default shape: ${shapeUsername}`);
              }
              
              // Prepare API request based on content type
              let apiMessages;
              
              if (attachments) {
                // Create multimodal content array
                const contentArray = [{ type: "text", text: content || "Please describe this" }];
                
                if (attachments.image) {
                  console.log('Adding image to API request');
                  contentArray.push({
                    type: "image_url",
                    image_url: { url: attachments.image }
                  });
                }
                
                if (attachments.audio) {
                  console.log('Adding audio to API request');
                  contentArray.push({
                    type: "audio_url",
                    audio_url: { url: attachments.audio }
                  });
                }
                
                apiMessages = [{ role: "user", content: contentArray }];
              } else {
                // Text-only request
                apiMessages = [{ role: "user", content: content }];
              }
              
              // Call the Shapes API using the OpenAI SDK
              const response = await shapes.chat.completions.create({
                model: `shapesinc/${shapeUsername}`,
                messages: apiMessages,
                temperature: 0.7,
                max_tokens: 1000
              });
              
              // Extract response
              const aiResponse = response.choices[0].message.content;
              console.log('AI Response:', aiResponse);
              
              // Получаем маскарад если есть активный Shape
              const masquerade = activeShapeId ? 
                await setMasquerade(message.channel, activeShapeId) : null;
              
              // Send the response back to the user
              await sendMessage(message.channel, aiResponse, masquerade);
              
            } catch (error) {
              console.error('Error processing message:', error.message);
              if (error.response) {
                console.error('API Response:', error.response.data);
              }
              
              const masquerade = activeShapes.has(message.channel) ? 
                await setMasquerade(message.channel, activeShapes.get(message.channel)) : null;
              await sendMessage(message.channel, "Sorry, I encountered an error while processing your request.", masquerade);
            }
          }
        }
        
        // ИСПРАВЛЕННАЯ обработка реакций для выбора персонажа
        if (message.type === 'MessageReact') {
          console.log('=== REACTION DEBUG ===');
          console.log('Full message object:', JSON.stringify(message, null, 2));
          
          // Проверяем, что реакция добавлена не ботом
          if (message.user_id === botId) {
            console.log('Ignoring bot reaction');
            return;
          }
          
          // Пробуем разные поля для получения эмодзи
          let emoji = null;
          
          // Варианты полей где может быть эмодзи в Revolt API
          if (message.emoji_id) {
            emoji = message.emoji_id;
          } else if (message.emoji) {
            emoji = message.emoji;
          } else if (message.id) {
            emoji = message.id;
          }
          
          console.log('Extracted emoji:', emoji);
          console.log('Emoji type:', typeof emoji);
          
          if (!emoji) {
            console.error('Could not extract emoji from reaction event');
            return;
          }
          
          // Ищем соответствующий Shape по эмодзи
          let selectedShapeId = null;
          for (const [shapeId, config] of Object.entries(shapeConfig)) {
            console.log(`Comparing "${config.emoji}" with "${emoji}"`);
            if (config.emoji === emoji) {
              selectedShapeId = shapeId;
              console.log(`Found matching shape: ${shapeId}`);
              break;
            }
          }
          
          if (selectedShapeId && availableShapes[selectedShapeId]) {
            console.log(`Shape selected: ${selectedShapeId} (${availableShapes[selectedShapeId]})`);
            
            // Получаем правильный channel ID
            const channelId = message.channel_id || message.channel;
            
            // Устанавливаем активный Shape для канала
            activeShapes.set(channelId, selectedShapeId);
            
            // Отправляем подтверждение
            const config = shapeConfig[selectedShapeId];
            const masquerade = await setMasquerade(channelId, selectedShapeId);
            
            await sendMessage(
              channelId, 
              `🎭 Персонаж изменён на **${config.name}** ${config.emoji}`,
              masquerade
            );
          } else {
            console.log(`No matching shape found for emoji: ${emoji}`);
            console.log('Available shapes:', Object.keys(shapeConfig));
            console.log('Available emojis:', Object.values(shapeConfig).map(c => c.emoji));
          }
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    });
    
    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
    
    socket.on('close', (code, reason) => {
      console.log(`WebSocket connection closed: ${code} - ${reason}`);
      console.log('Reconnecting in 5 seconds...');
      setTimeout(startBot, 5000);
    });
    
  } catch (error) {
    console.error('Error starting bot:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    console.log('Retrying in 10 seconds...');
    setTimeout(startBot, 10000);
  }
}

// Start the bot
console.log('Starting bot...');
startBot();