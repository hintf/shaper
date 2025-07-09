const https = require('https');

class RevoltAPI {
  constructor(token) {
    this.token = token;
  }

  request(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : '';
      const options = {
        hostname: 'api.revolt.chat',
        path: endpoint,
        method: method,
        headers: {
          'x-bot-token': this.token,
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

  get(endpoint) {
    return this.request('GET', endpoint);
  }

  post(endpoint, body) {
    return this.request('POST', endpoint, body);
  }

  put(endpoint, body) {
    return this.request('PUT', endpoint, body);
  }

  delete(endpoint) {
    return this.request('DELETE', endpoint);
  }

  patch(endpoint, body) {
    return this.request('PATCH', endpoint, body);
  }

  // Удаление сообщения
  async deleteMessage(channelId, messageId) {
    try {
      await this.delete(`/channels/${channelId}/messages/${messageId}`);
      return true;
    } catch (error) {
      console.error(`Error deleting message ${messageId}:`, error.message);
      return false;
    }
  }

  // Обновление профиля бота
  async updateBotProfile(username, avatar) {
    try {
      const body = {};
      if (username) body.username = username;
      if (avatar) body.avatar = avatar;
      
      await this.patch('/users/@me', body);
      return true;
    } catch (error) {
      console.error('Error updating bot profile:', error.message);
      return false;
    }
  }
}

module.exports = RevoltAPI;