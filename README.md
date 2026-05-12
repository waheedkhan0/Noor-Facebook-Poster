# Quran and Hadith Auto Poster

An automated application for posting Quran pages and Hadith content to Facebook groups. This bot helps spread Islamic knowledge by systematically sharing Quran pages and authentic Hadith across multiple Facebook groups. Once configured, it will automatically post to all your specified groups based on your schedule (hourly, daily, or any custom interval you set using cron expressions).

## How It Works

This application leverages the [Fewfeed Chrome Extension](https://fewfeed.com/) to automate the posting process. Here's how it works:

1. The app uses Puppeteer to control a Chrome browser instance with the Fewfeed extension installed
2. It automatically logs into your Facebook account (using either credentials or cookies)
3. For each posting cycle:
   - Selects a random Quran page from the `quran-images` directory.
   - Fetches a random Hadith from the Hadith API
   - Uses Fewfeed's functionality to post this content to your configured Facebook groups
4. The entire process runs automatically based on your configured schedule (CRON_SCHEDULE)
5. In development mode (HEADLESS=false), you can watch the automation process in action

## Features

- 🕌 Random Quran pages with proper formatting
- 📚 Random Hadith selection from verified sources
- 👥 Automated posting to multiple Facebook groups
- ⏰ Configurable posting schedule using cron expressions
- 🔄 Automatic session management and login handling
- 🛡️ Error handling and retry mechanisms
- 🌐 Web-based admin panel with dashboard, config editor, log viewer, and action controls

## Prerequisites

- Node.js >= 18.0.0
- A valid Facebook account

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# --- Facebook Authentication ---
FB_EMAIL=your-facebook-email
FB_PASSWORD=your-facebook-password
FACEBOOK_COOKIES=[]      # Array of Facebook session cookies (required for production, leave empty for development)

# --- Bot Schedule ---
CRON_SCHEDULE=0 14,18 * * *  # Cron schedule for posting (e.g., "0 * * * *" for hourly, "0 14,18 * * *" for 2PM & 6PM daily)

# --- Bot Behavior ---
POST_DELAY_MINUTES=180   # Minutes to wait after posting for shares to complete
HEADLESS=true            # Set to false if you want to see the browser automation process (must be true in production)
NODE_ENV=development     # or production

# --- Admin Panel ---
ADMIN_PORT=3000          # Port for the admin web interface
ADMIN_USERNAME=admin     # Admin panel login username
ADMIN_PASSWORD=admin123  # Admin panel login password
SESSION_SECRET=quran-poster-secret-change-in-production  # Session secret for admin panel

# --- Puppeteer ---
PUPPETEER_EXECUTABLE_PATH=  # Path to Chromium executable (optional, auto-detected if omitted)
```

### Environment Variable Reference

| Variable | Default | Description |
|---|---|---|
| `FB_EMAIL` | `""` | Facebook account email |
| `FB_PASSWORD` | `""` | Facebook account password |
| `FACEBOOK_COOKIES` | `""` | Session cookies JSON array (required in production) |
| `CRON_SCHEDULE` | `0 14,18 * * *` | Cron expression for posting schedule |
| `POST_DELAY_MINUTES` | `180` | Wait time after posting (minutes) |
| `HEADLESS` | `true` (in production) | Run browser without GUI |
| `NODE_ENV` | `development` | Environment mode |
| `ADMIN_PORT` | `3000` | Admin panel web port |
| `ADMIN_USERNAME` | `admin` | Admin login username |
| `ADMIN_PASSWORD` | `admin123` | Admin login password |
| `SESSION_SECRET` | `quran-poster-secret-change-in-production` | Express session signing secret |
| `PUPPETEER_EXECUTABLE_PATH` | `null` | Custom Chromium/Chrome path |

## Installation

1. Clone the repository:
   ```bash
   git https://github.com/XredaX/Quran-Hadith-Poster.git
   cd Quran-Hadith-Poster
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your environment variables in `.env` file

4. Run the application:
   ```bash
   node index.js
   ```

5. Open the admin panel:
   ```
   http://localhost:3000
   ```

## Admin Panel

The application includes a full-featured web-based admin panel for managing the bot without editing files directly.

### Access

- URL: `http://localhost:<ADMIN_PORT>` (default `http://localhost:3000`)
- Login with `ADMIN_USERNAME` / `ADMIN_PASSWORD`

### Pages

| Route | Description |
|---|---|
| `/admin/dashboard` | Bot status, last/next post, login state, action buttons |
| `/admin/config` | Edit all bot settings via a form |
| `/admin/logs` | View and clear application logs |

### Actions

- **Post Now** - Trigger an immediate posting cycle
- **Test Login** - Verify Facebook credentials/cookies work
- **Restart Cron** - Reload the cron schedule from current config
- **Clear Logs** - Remove all log entries
- **Clear History** - Remove all post history entries

### Configurable Settings

- Cron schedule, post delay, headless mode, bot enabled/disabled
- Facebook email, password, cookies
- Max retries, retry delay, max hadith number, max Quran page
- Admin port, username, password
- Environment mode

## Directory Structure

```
.
├── index.js              # Main application file
├── package.json          # Dependencies and scripts
├── fewfeed/              # Chrome extension for Facebook group posting
├── quran-images/         # Directory containing Quran page images
├── cookies.json          # Facebook session cookies (auto-generated)
├── .env                  # Environment variables
├── Dockerfile            # Docker configuration for deployment
├── admin/                # Admin panel module
│   ├── server.js         # Express web server with routes
│   ├── config.js         # Configuration management (admin/config.json)
│   ├── history.js        # Post history tracking (admin/history.json)
│   ├── logger.js         # Application logging (admin/logs.json)
│   └── views/            # EJS templates
│       ├── login.ejs
│       ├── dashboard.ejs
│       ├── config.ejs
│       ├── logs.ejs
│       ├── layout-header.ejs
│       └── layout-footer.ejs
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Contact

Feel free to reach out if you have any questions or suggestions:

- LinkedIn: [Reda El Bettioui](https://www.linkedin.com/in/reda-el-bettioui/)
- Email: redaelbettioui@gmail.com

## References

### Quran Pages
The Quran pages images used in this project are sourced from:
- [Quran Pages Images Repository](https://github.com/zeyadetman/quran-pages-images) by zeyadetman

### Hadith Sources
The Hadith content is carefully selected from authentic sources using the [Hadith API](https://api.hadith.gading.dev/)

### Chrome Extension
The automation is powered by [Fewfeed](https://fewfeed.com/) - a powerful Chrome extension for automated Facebook group posting