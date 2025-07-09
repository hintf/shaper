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

      // Проверяем команды Shapes API
      if (message.content && message.content.trim().startsWith('!shape_')) {
        await this.handleShapeCommand(message, botId);
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

  // Обработка команд Shapes API
  async handleShapeCommand(message, botId) {
    try {
      const content = message.content.trim();
      const commandMatch = content.match(/^!shape_(\w+)(?:\s+(.+))?$/);
      
      if (!commandMatch) {
        await this.sendHelpMessage(message.channel, message.author === this.botOwnerId);
        return;
      }

      const [, command, args] = commandMatch;
      
      // Проверяем права доступа для деструктивных команд
      const ownerOnlyCommands = ['reset', 'wack', 'sleep', 'dashboard'];
      if (ownerOnlyCommands.includes(command) && message.author !== this.botOwnerId) {
        const masquerade = await this.shaperHandler.getActiveMasquerade(message.channel);
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

      // Определяем активный персонаж
      const activeShapeId = this.shaperHandler.getActiveShape(message.channel);
      let shapeUsername;
      
      if (activeShapeId && this.availableShapes[activeShapeId]) {
        shapeUsername = this.availableShapes[activeShapeId];
      } else {
        const firstShapeId = Object.keys(this.availableShapes)[0];
        shapeUsername = this.availableShapes[firstShapeId];
      }

      // Отправляем команду к Shapes API
      const response = await this.shapes.chat.completions.create({
        model: `shapesinc/${shapeUsername}`,
        messages: [{ role: "user", content: shapeCommand }],
        temperature: 0.7,
        max_tokens: 1000
      });

      const aiResponse = response.choices[0].message.content;
      const masquerade = await this.shaperHandler.getActiveMasquerade(message.channel);
      
      await this.messageManager.sendMessage(message.channel, aiResponse, masquerade);

    } catch (error) {
      console.error('Error handling shape command:', error.message);
      
      const masquerade = await this.shaperHandler.getActiveMasquerade(message.channel);
      await this.messageManager.sendMessage(
        message.channel, 
        "❌ Ошибка при выполнении команды.", 
        masquerade
      );
    }
  }

  // Отправка сообщения с помощью по командам
  async sendHelpMessage(channelId, isOwner = false) {
    let helpText = `🤖 **Доступные команды Shapes API:**

**Творчество:**
• \`!shape_imagine [описание]\` - Генерация изображения

**Поиск:**
• \`!shape_web [запрос]\` - Поиск в интернете

**Информация:**
• \`!shape_info\` - Информация о персонаже
• \`!shape_help\` - Показать эту справку`;

    if (isOwner) {
      helpText += `

**🔒 Команды владельца:**
• \`!shape_reset\` - Сброс долгосрочной памяти
• \`!shape_wack\` - Сброс краткосрочной памяти
• \`!shape_sleep\` - Принудительное сохранение памяти
• \`!shape_dashboard\` - Ссылка на панель управления`;
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
      // Сохраняем исходное сообщение пользователя
      this.messageManager.addRecentUserMessage(message._id, {
        content: message.content,
        attachments: message.attachments,
        channelId: message.channel,
        authorId: message.author,
        _id: message._id
      });

      // Очищаем упоминание из текста
      let content = message.content || '';
      if (content.includes(`<@${botId}>`)) {
        content = content.replace(new RegExp(`<@${botId}>`, 'g'), '').trim();
      }

      // Обрабатываем вложения
      const attachments = this.processAttachments(message.attachments);

      // Если нет текста и вложений, отправляем приветствие
      if (!content && !attachments) {
        const masquerade = await this.shaperHandler.getActiveMasquerade(message.channel);
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

      // Определяем активный персонаж
      const activeShapeId = this.shaperHandler.getActiveShape(message.channel);
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

      // Отправляем запрос к Shapes API
      const response = await this.shapes.chat.completions.create({
        model: `shapesinc/${shapeUsername}`,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 1000
      });

      const aiResponse = response.choices[0].message.content;

      // Получаем маскарад для ответа
      const masquerade = await this.shaperHandler.getActiveMasquerade(message.channel);

      // Отправляем ответ
      await this.messageManager.sendMessage(message.channel, aiResponse, masquerade, message._id);

    } catch (error) {
      console.error('Error processing message:', error.message);
      
      const masquerade = await this.shaperHandler.getActiveMasquerade(message.channel);
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