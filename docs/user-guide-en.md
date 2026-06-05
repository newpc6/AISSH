# AI SSH User Guide

## Quick Start

### First Launch

1. Download and install AI SSH
2. Set your login password after launching
3. Configure AI provider in Settings (OpenAI, Ollama, or custom endpoint)
4. Start adding servers and using AI assistance

### Adding Servers

1. Click the `+` button in the left panel
2. Fill in server information:
   - Name: An easily recognizable name for the server
   - Group: Select or create a group
   - Address: Server IP or domain
   - Port: SSH port (default 22)
   - Username: Login username
   - Authentication: Password or SSH key
3. Click Save

### Connecting to Servers

- **Method 1**: Double-click a server in the server list
- **Method 2**: Select a server and click the `+` button in the session bar
- **Method 3**: Click "Connect" in the server card's top-right menu

## Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Function |
|----------|----------|
| `Ctrl + N` | New session |
| `Ctrl + W` | Close current session |
| `Ctrl + Tab` | Switch to next session |
| `Ctrl + Shift + Tab` | Switch to previous session |
| `Ctrl + ,` | Open settings |
| `Ctrl + Q` | Quit application |

### Terminal Shortcuts

| Shortcut | Function |
|----------|----------|
| `Ctrl + C` | Copy selected text |
| `Ctrl + V` | Paste text |
| `Ctrl + Shift + C` | Force copy |
| `Ctrl + Shift + V` | Force paste |
| `Ctrl + L` | Clear screen |
| `Ctrl + U` | Delete all content before cursor |
| `Ctrl + K` | Delete all content after cursor |
| `Ctrl + A` | Move to beginning of line |
| `Ctrl + E` | Move to end of line |
| `Tab` | Auto-complete / Accept AI prediction |

### File Browser Shortcuts

| Shortcut | Function |
|----------|----------|
| `Enter` | Enter directory / Open file |
| `Backspace` | Go to parent directory |
| `F5` | Refresh file list |
| `Ctrl + U` | Upload file |
| `Delete` | Delete selected file |

### AI Assistant Shortcuts

| Shortcut | Function |
|----------|----------|
| `Ctrl + Space` | Trigger AI command prediction |
| `Enter` | Send message (in AI input box) |
| `Escape` | Clear AI input |

## Feature Details

### 1. SSH Session Management

#### Session Tabs
- Each session displays as a tab
- The dot on the tab indicates connection status:
  - 🟢 Green: Connected
  - 🟡 Yellow: Connecting
  - 🔴 Red: Disconnected
  - ⚪ Gray: Idle

#### Session Operations
- **Reconnect**: Click the "Reconnect" button in the terminal header
- **Close**: Click the `×` button on the tab
- **Switch**: Click the tab or use shortcuts

### 2. AI Assistant

#### AI Modes
- **Review Mode**: AI generates commands that require manual confirmation
- **Auto Mode**: AI automatically executes multi-step tasks

#### Using AI
1. Enter a question or task in the right AI panel
2. AI provides suggestions based on terminal context
3. In review mode, check commands and click "Execute"
4. In auto mode, AI automatically executes the entire process

#### AI Command Prediction
- While typing in the terminal, AI predicts the next command
- Press `Tab` to accept the prediction
- Continue typing to ignore the prediction

#### Terminal Selection to AI
1. Select text in the terminal
2. Click the "Add to AI" button
3. Text is automatically added to the AI input box

### 3. File Management

#### File Browsing
- Click the "Files" tab on the left to switch to file mode
- Support direct path input
- Double-click directory to enter
- Right-click file to download or preview

#### File Transfer
- **Upload**: Click "Upload" button or drag files to the panel
- **Download**: Right-click file and select "Download"
- **Edit**: Double-click text file for online editing

#### Path Tracking
- Check "Track Terminal Path"
- File panel automatically follows the terminal's current directory

### 4. Server Monitoring

#### Real-time Metrics
- CPU usage and trend chart
- Memory usage
- Disk space
- Network bandwidth

#### Chart Operations
- Hover mouse to view detailed data
- Click zoom icon for larger view
- Adjust refresh frequency in settings

### 5. Command History & Favorites

#### Command History
- Automatically records all executed commands
- Support search and filtering
- Click command to quickly copy or execute

#### Favorite Commands
- Click the star icon next to a command to favorite
- Favorite commands are saved in the "Favorites" tab
- Support sorting and grouping

### 6. Server Group Management

#### Creating Groups
1. Click the "Groups" button on the left
2. Click "Add Group"
3. Enter group name and save

#### Managing Groups
- Rename: Directly modify group name
- Delete: Delete unused groups
- Sort: Drag groups to adjust order

### 7. Batch Operations

#### Batch Mode
1. Select multiple servers in the server list
2. Enter a unified task description
3. AI generates and executes commands for each server

#### Use Cases
- Batch application deployment
- Unified configuration updates
- Batch log collection
- Unified health checks

## Settings Guide

### General Settings
- **Health Check Interval**: Frequency of checking server connection status
- **Terminal Lines**: Number of history lines retained per session
- **Interface Layout**: Adjust panel width and height

### Security Settings
- **Desktop Login**: Whether password is required at startup
- **Web Access**: Whether to allow browser access
- **Password Change**: Change login password

### AI Settings
- **AI Provider**: Choose OpenAI, Ollama, or custom
- **API Endpoint**: Set AI service address
- **Model Selection**: Choose the model to use
- **System Prompt**: Customize AI behavior
- **Context Length**: Terminal history length AI can reference
- **Prediction Count**: Number of commands AI predicts

### Metrics Settings
- **Refresh Interval**: Server metrics update frequency
- **Chart Time Range**: Time span displayed in trend charts
- **Data Points**: Number of data points on charts

## Advanced Features

### Custom System Prompt

In AI settings, you can customize the system prompt to adjust AI behavior:

```
You are a professional Linux system administrator assistant.
- Prefer safe commands
- Warn about dangerous operations
- Provide detailed command explanations
```

Check "Override Default System Prompt" to completely replace the built-in prompt with your custom prompt.

### Agent Mode Configuration

For complex tasks, you can adjust Agent parameters in settings:

- **Max Tokens**: Maximum length of single AI response
- **Context Limit**: Maximum context AI can reference
- **Steps Limit**: Maximum steps Agent can automatically execute
- **Timeout Settings**: Command execution timeout

### Import/Export

#### Export Server List
1. Click "File" → "Export Server List"
2. Choose whether to include encrypted credentials
3. Save JSON file

#### Import Server List
1. Click "File" → "Import Server List"
2. Select previously exported JSON file
3. Confirm import

#### Export Software Configuration
- Export all settings and preferences
- Convenient for syncing configuration across different computers

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to server
**Solution**:
1. Check server address and port
2. Confirm username and password/key are correct
3. Check network connection
4. View runtime logs (Tools → Logs)

### AI Issues

**Problem**: AI not responding or errors
**Solution**:
1. Check AI provider settings
2. Confirm API Key is correct
3. Check network connection to AI service
4. View AI error logs

### Performance Issues

**Problem**: Application running slowly
**Solution**:
1. Reduce terminal retention lines
2. Lower metrics refresh frequency
3. Close unnecessary sessions
4. Check system resource usage

## Best Practices

### Security Recommendations
1. Use SSH key authentication instead of passwords
2. Regularly change login password
3. Don't enable web access on public networks
4. Handle encrypted credentials carefully when exporting configuration

### Efficiency Tips
1. Make good use of command favorites
2. Configure common AI prompts
3. Use batch mode for repetitive tasks
4. Utilize shortcuts to improve operation speed

### AI Usage Tips
1. Provide clear task descriptions
2. Check dangerous commands in review mode
3. Use terminal context to help AI understand better
4. Customize system prompt to optimize AI behavior

## Changelog

View application update history and new feature introductions.

## Getting Help

- **Documentation**: View complete documentation
- **Issue Feedback**: Submit bug reports or feature suggestions
- **Community**: Join user community for discussion
