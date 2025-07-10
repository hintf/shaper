const OpenAI = require('openai');

class MessageHandler {
  constructor(revoltAPI, messageManager, shaperHandler, availableShapes, apiKey, botOwnerId) {
    this.api = revoltAPI;
    this.messageManager = messageManager;
    this.shaperHandler = shaperHandler;
    this.availableShapes = availableShapes;
    this.botOwnerId = botOwnerId;
    
    // Настройка Shapes API клиента
    this.shapes = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.shapes.inc/v1',
    });
  }

  // Обработка входящего сообщения
  async handleMessage(message, botId) {
    try {
      // Игнорируем собственные сообщения
      if (message.author === botId) return;

      // Проверяем команду !shaper
      if (message.content && message.content.trim() === '!shaper') {
        await this.shaperHandler.handleShaperCommand(message.channel, message._id);
        return;
      }

      // Проверяем команды !shaper с подкомандами
      if (message.content && message.content.trim().startsWith('!shaper ')) {
        await this.handleShaperSubcommand(message, botId);
        return;
      }

      // Определяем, нужно ли отвечать на сообщение
      const shouldRespond = await this.shouldRespondToMessage(message, botId);
      if (!shouldRespond) return;

      // Обрабатываем сообщение
      await this.processMessage(message, botId);
      
    } catch (error) {
      console.error('Error handling message:', error.message);
    }
  }

  // Получение отображаемого имени пользователя
  async getUserUsername(userId) {
    try {
      const { data: userData } = await this.api.get(`/users/${userId}`);
      
      // Формируем отображаемое имя в формате username#discriminator
      if (userData.username) {
        const discriminator = userData.discriminator || '0000';
        return `${userData.username}#${discriminator}`;
      }
      
      // Если username недоступен, возвращаем ID как fallback
      return userId;
    } catch (error) {
      console.error(`Error fetching user data for ${userId}:`, error.message);
      // В случае ошибки возвращаем ID как fallback
      return userId;
    }
  }

  // Обработка подкомманд !shaper
  async handleShaperSubcommand(message, botId) {
    try {
      const content = message.content.trim();
      const commandMatch = content.match(/^!shaper\s+(\w+)(?:\s+(.+))?$/);
      
      if (!commandMatch) {
        await this.sendHelpMessage(message.channel, message.author === this.botOwnerId);
        return;
      }

      const [, command, args] = commandMatch;
      
      // Проверяем права доступа для деструктивных команд
      const ownerOnlyCommands = ['reset', 'wack', 'sleep', 'dashboard'];
      if (ownerOnlyCommands.includes(command) && message.author !== this.botOwnerId) {
        const masquerade = await this.shaperHandler.getActiveMasquerade(message.channel, message.author);
        await this.messageManager.sendMessage(
          message.channel, 
          "❌ **Доступ запрещён!** Эта команда доступна только владельцу бота.", 
          masquerade
        );
        return;
      }

      // Специальная обработка команды help
      if (command === 'help') {
        await this.sendHelpMessage(message.channel, message.author === this.botOwnerId);
        return;
      }

      // Формируем команду для Shapes API
      let shapeCommand;
      switch (command) {
        case 'imagine':
          shapeCommand = args ? `!imagine ${args}` : '!imagine a beautiful landscape';
          break;
        case 'web':
          shapeCommand = args ? `!web ${args}` : '!web latest news';
          break;
        case 'reset':
          shapeCommand = '!reset';
          break;
        case 'sleep':
          shapeCommand = '!sleep';
          break;
        case 'info':
          shapeCommand = '!info';
          break;
        case 'dashboard':
          shapeCommand = '!dashboard';
          break;
        case 'wack':
          shapeCommand = '!wack';
          break;
        default:
          await this.sendHelpMessage(message.channel, message.author === this.botOwnerId);
          return;
      }

      // Получаем отображаемое имя пользователя
      const userDisplayName = await this.getUserUsername(message.author);

      // Определяем активный персонаж
      const activeShapeId = this.shaperHandler.getActiveShape(message.channel, message.author);
      let shapeUsername;
      
      if (activeShapeId && this.availableShapes[activeShapeId]) {
        shapeUsername = this.availableShapes[activeShapeId];
      } else {
        const firstShapeId = Object.keys(this.availableShapes)[0];
        shapeUsername = this.availableShapes[firstShapeId];
      }

      // Подготавливаем custom headers
      const customHeaders = {
        'X-User-Id': userDisplayName,
        'X-Channel-Id': message.channel
      };

      // Отправляем команду к Shapes API
      const response = await this.shapes.chat.completions.create({
        model: `shapesinc/${shapeUsername}`,
        messages: [{ role: "user", content: shapeCommand }],
        temperature: 0.7,
        max_tokens: 1000
      }, {
        headers: customHeaders
      });

      const aiResponse = response.choices[0].message.content;
      const masquerade = await this.shaperHandler.getActiveMasquerade(message.channel, message.author);
      
      await this.messageManager.sendMessage(message.channel, aiResponse, masquerade);

    } catch (error) {
      console.error('Error handling shaper subcommand:', error.message);
      
      const masquerade = await this.shaperHandler.getActiveMasquerade(message.channel, message.author);
      await this.messageManager.sendMessage(
        message.channel, 
        "❌ Ошибка при выполнении команды.", 
        masquerade
      );
    }
  }

  // Отправка сообщения с помощью по командам
  async sendHelpMessage(channelId, isOwner = false) {
    let helpText = `🤖 **Доступные команды !shaper:**

**Творчество:**
• \`!shaper imagine [описание]\` - Генерация изображения

**Поиск:**
• \`!shaper web [запрос]\` - Поиск в интернете

**Информация:**
• \`!shaper info\` - Информация о персонаже
• \`!shaper help\` - Показать эту справку`;

    if (isOwner) {
      helpText += `

**🔒 Команды владельца:**
• \`!shaper reset\` - Сброс долгосрочной памяти
• \`!shaper wack\` - Сброс краткосрочной памяти
• \`!shaper sleep\` - Принудительное сохранение памяти
• \`!shaper dashboard\` - Ссылка на панель управления`;
    } else {
      helpText += `

*Некоторые команды доступны только владельцу бота.*`;
    }

    helpText += `\n\n*Команды выполняются от имени текущего активного персонажа.*`;

    await this.messageManager.sendMessage(channelId, helpText);
  }

  // Определение, нужно ли отвечать на сообщение
  async shouldRespondToMessage(message, botId) {
    // Проверяем упоминание бота
    const isMentioned = message.content && message.content.includes(`<@${botId}>`);
    
    // Проверяем, является ли это ответом на сообщение бота
    const isReplyToBot = this.messageManager.isReplyToBot(message.replies);
    
    // Проверяем, является ли это личным сообщением
    let isDM = false;
    try {
      const { data: channelData } = await this.api.get(`/channels/${message.channel}`);
      isDM = channelData.channel_type === 'DirectMessage';
    } catch (err) {
      console.error('Error checking channel type:', err.message);
    }

    return isMentioned || isDM || isReplyToBot;
  }

  // Обработка сообщения и генерация ответа
  async processMessage(message, botId) {
    try {
      // Очищаем упоминание из текста
      let content = message.content || '';
      if (content.includes(`<@${botId}>`)) {
        content = content.replace(new RegExp(`<@${botId}>`, 'g'), '').trim();
      }

      // Обрабатываем вложения
      const attachments = this.processAttachments(message.attachments);

      // Если нет текста и вложений, отправляем приветствие
      if (!content && !attachments) {
        const masquerade = await this.shaperHandler.getActiveMasquerade(message.channel, message.author);
        await this.messageManager.sendMessage(
          message.channel, 
          "Hello! How can I help you today?", 
          masquerade
        );
        return;
      }

      // Если нет текста, но есть вложения
      if (!content && attachments) {
        content = "Please describe this";
      }

      // Получаем отображаемое имя пользователя
      const userDisplayName = await this.getUserUsername(message.author);

      // Определяем активный персонаж
      const activeShapeId = this.shaperHandler.getActiveShape(message.channel, message.author);
      let shapeUsername;
      
      if (activeShapeId && this.availableShapes[activeShapeId]) {
        shapeUsername = this.availableShapes[activeShapeId];
      } else {
        // Используем первый доступный Shape как default
        const firstShapeId = Object.keys(this.availableShapes)[0];
        shapeUsername = this.availableShapes[firstShapeId];
      }

      // Подготавливаем запрос к API
      const apiMessages = this.prepareAPIMessages(content, attachments);

      // Подготавливаем custom headers
      const customHeaders = {
        'X-User-Id': userDisplayName,
        'X-Channel-Id': message.channel
      };

      // Отправляем запрос к Shapes API
      const response = await this.shapes.chat.completions.create({
        model: `shapesinc/${shapeUsername}`,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 1000
      }, {
        headers: customHeaders
      });

      const aiResponse = response.choices[0].message.content;

      // Получаем маскарад для ответа
      const masquerade = await this.shaperHandler.getActiveMasquerade(message.channel, message.author);

      // Отправляем ответ
      await this.messageManager.sendMessage(message.channel, aiResponse, masquerade);

    } catch (error) {
      console.error('Error processing message:', error.message);
      
      const masquerade = await this.shaperHandler.getActiveMasquerade(message.channel, message.author);
      await this.messageManager.sendMessage(
        message.channel, 
        "Sorry, I encountered an error while processing your request.", 
        masquerade
      );
    }
  }

  // Подготовка сообщений для API
  prepareAPIMessages(content, attachments) {
    if (attachments) {
      const contentArray = [{ type: "text", text: content || "Please describe this" }];
      
      if (attachments.image) {
        contentArray.push({
          type: "image_url",
          image_url: { url: attachments.image }
        });
      }
      
      if (attachments.audio) {
        contentArray.push({
          type: "audio_url",
          audio_url: { url: attachments.audio }
        });
      }
      
      return [{ role: "user", content: contentArray }];
    } else {
      return [{ role: "user", content: content }];
    }
  }

  // Обработка вложений
  processAttachments(attachments) {
    if (!attachments || attachments.length === 0) return null;
    
    const result = {};
    const REVOLT_SERVER_URL = process.env.REVOLT_SERVER_URL || 'https://autumn.revolt.chat';
    
    for (const attachment of attachments) {
      let url = '';
      
      if (attachment.url) {
        url = attachment.url;
      } else if (attachment._id || attachment.id) {
        const attachmentId = attachment._id || attachment.id;
        url = `${REVOLT_SERVER_URL}/attachments/${attachmentId}`;
      }
      
      if (url && !url.startsWith('http')) {
        url = `https://${url}`;
      }
      
      if (!url) continue;
      
      const contentType = attachment.content_type || '';
      if (contentType.startsWith('image/') || url.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
        result.image = url;
      } else if (contentType.startsWith('audio/') || url.match(/\.(mp3|wav|ogg|m4a)$/i)) {
        result.audio = url;
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  }
}

module.exports = MessageHandler;
