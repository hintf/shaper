# Shapes Revolt Bot

A Revolt chat bot that brings AI-powered conversations with customizable characters to your servers. Built with the Shapes.inc API, this bot lets users switch between different AI personalities and interact with them naturally.

## 🤖 About This Project

This bot was developed through AI collaboration using Deepseek and Claude, with final refinement on Bolt.new. It's based on the [official Shapes API example](https://github.com/hintf/shapes-api/tree/main/examples/social/shape-revolt) but significantly expanded with additional features and improvements.

**Fair warning**: I'm a hobbyist developer who enjoys tinkering with bots and APIs. While I'm happy to help if you run into issues, my knowledge has limits! The code works well for my use case, but your mileage may vary.

## ✨ Key Features

**Character Masquerading**: The bot uses Revolt's masquerade feature to appear as different characters with unique names, avatars, and colors. This is particularly valuable since Revolt has stricter bot limits compared to Discord - one bot can effectively become multiple personalities.

**Native Shapes API Commands**: Full support for Shapes.inc commands like `!shaper imagine` for image generation, `!shaper web` for web searches, and memory management commands. No need to remember different syntax - it's all built in.

**Smart Context Headers**: The bot sends custom headers to the Shapes API including the user's display name (like "Username#1234") and channel ID. This means the AI can address users by name and maintain context awareness across different channels.

**Per-User Character Selection**: Each user can choose their preferred AI character independently. Your choice of the wise old man doesn't affect someone else's preference for the energetic squirrel.

**Intelligent Response Detection**: The bot responds to direct mentions, DMs, and replies to its own messages. No free will and likely there won't be - I prefer calm and measured interactions over pseudo "involvement" of AI.

## 🚀 Getting Started

### Prerequisites

You'll need Node.js installed and accounts for:
- [Revolt](https://revolt.chat) (create a bot in User Settings > My Bots)
- [Shapes.inc](https://shapes.inc) (for the API key and character usernames)

### Installation

Clone this repository and install dependencies:

```bash
git clone https://github.com/hintf/shaper.git
cd shaper
npm install
```

### Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

The most important variables to set:
- `REVOLT_TOKEN`: Your bot token from Revolt
- `SHAPESINC_API_KEY`: Your API key from Shapes.inc
- `BOT_OWNER_ID`: Your Revolt user ID (for admin commands)
- `SHAPESINC_SHAPE_USERNAME_1` through `SHAPESINC_SHAPE_USERNAME_6`: The usernames of your Shapes characters

### Running the Bot

For development:
```bash
npm run dev
```

For production:
```bash
npm start
```

## 🎭 Customizing Your Bot

### Adding Your Own Characters

The bot comes configured for 2 character slots, but you can easily customize them:

**Character Configuration** (`config/shapes.js`): Update the `shapeConfig` object with your preferred emojis, names, and colors. The structure is straightforward - each number corresponds to a character slot.

**Avatar Setup** (`config/avatars.js`): Replace the avatar URLs with your own images. The bot includes fallback avatars using DiceBear if your primary images aren't available.

**Environment Variables**: Set `SHAPESINC_SHAPE_USERNAME_1` through `SHAPESINC_SHAPE_USERNAME_...` to match your actual Shapes.inc character usernames.

### Modifying Behavior

The bot's personality and responses are determined by your Shapes.inc characters, not the code itself. If you want a character to be more formal or casual, train that character accordingly on the Shapes platform.

Command handling is in `handlers/messageHandler.js` if you want to add custom bot commands beyond the standard Shapes API ones.

## 🛠️ Deployment

### Security First

Never commit your `.env` file to version control. The `.gitignore` already excludes it, but double-check before pushing code anywhere public.

Consider using environment variables on your hosting platform instead of a `.env` file for production deployments.

### Using PM2 (Recommended)

PM2 keeps your bot running and automatically restarts it if something goes wrong:

```bash
# Install PM2 globally
npm install -g pm2

# Start the bot with PM2
pm2 start bot.js --name "shapes-revolt-bot"

# Save PM2 configuration
pm2 save

# Set PM2 to start on system boot
pm2 startup
```

Useful PM2 commands:
```bash
pm2 status                    # Check bot status
pm2 logs shapes-revolt-bot    # View logs
pm2 restart shapes-revolt-bot # Restart the bot
pm2 stop shapes-revolt-bot    # Stop the bot
```

### Alternative: Screen/Tmux

If PM2 feels like overkill, you can use screen or tmux to keep the bot running:

```bash
# Using screen
screen -S revolt-bot
npm start
# Press Ctrl+A, then D to detach

# Reattach later with:
screen -r revolt-bot
```

### VPS Deployment

Most VPS providers work fine. Make sure you have:
- Node.js 16+ installed
- Sufficient RAM (the bot is lightweight, 512MB is plenty)
- Stable internet connection
- Firewall configured if needed (the bot only makes outbound connections)

## 🎮 Usage

### Basic Commands

- `!shaper`: Shows character selection menu with reaction-based selection
- `!shaper help`: Displays available commands
- `!shaper imagine [description]`: Generate an image
- `!shaper web [query]`: Search the web
- `!shaper info`: Get information about the current character

### Admin Commands (Bot Owner Only)

- `!shaper reset`: Clear long-term memory
- `!shaper wack`: Clear short-term memory  
- `!shaper sleep`: Force memory save
- `!shaper dashboard`: Get dashboard link

### Interaction

The bot responds to mentions, DMs, and replies to its messages. Just talk naturally - no special syntax required for regular conversation.

## 🐛 Troubleshooting

**Bot not responding**: Check that your `REVOLT_TOKEN` is correct and the bot is online in your server.

**Character selection not working**: Verify your `SHAPESINC_SHAPE_USERNAME_*` variables match your actual Shapes.inc usernames.

**API errors**: Double-check your `SHAPESINC_API_KEY` and ensure you have credits/access on Shapes.inc.

**Avatar issues**: The bot will fall back to generated avatars if your custom ones aren't accessible. Check the URLs in `config/avatars.js`.

## 📝 Contributing

This is a hobby project, but if you find bugs or have improvements, feel free to open an issue or pull request. Just keep in mind that I might not respond immediately - real life and all that!

## 📄 License

This project is open source. Use it, modify it, break it, fix it - whatever makes you happy. Just don't blame me if your bot achieves sentience and starts ordering pizza at 3 AM.

## 🙏 Acknowledgments

- The Shapes.inc team for their excellent API
- The Revolt development team for building a great Discord alternative
- The AI assistants (Deepseek, Claude) that helped write most of this code
- Bolt.new platform for their amazing assistant and comfortable UI
- Coffee, for making late-night coding sessions possible
