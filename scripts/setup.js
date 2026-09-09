const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('====================================================');
console.log('🎧 Starting DJ App Environment Setup...');
console.log('====================================================\n');

// 1. You cannot perform this script without Node, so Node is implicitly verified!
console.log('✅ Node.js is installed.');

// Helper to check command existence
const checkCommand = (cmd) => {
    try {
        execSync(`${cmd} --version`, { stdio: 'ignore' });
        return true;
    } catch {
        try {
            execSync(`${cmd} -version`, { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }
};

// 2. Check Python
console.log('🔍 Checking for Python 3.10+...');
const isPythonExe = checkCommand('python');
const isPython3Exe = checkCommand('python3');
const pythonCmd = isPythonExe ? 'python' : (isPython3Exe ? 'python3' : null);

if (!pythonCmd) {
    console.error('\n❌ ERROR: Python is NOT installed or not added to PATH.');
    console.error('Please download Python 3.10+ from: https://www.python.org/downloads/');
    console.error('IMPORTANT: Check the box that says "Add Python to PATH" during installation.\n');
    process.exit(1);
} else {
    const pyVer = execSync(`${pythonCmd} --version`).toString().trim();
    console.log(`✅ ${pyVer} is installed.`);
}

// 3. Check FFmpeg
console.log('🔍 Checking for FFmpeg...');
if (!checkCommand('ffmpeg')) {
    console.error('\n❌ ERROR: FFmpeg is NOT installed or not added to PATH.');
    console.error('FFmpeg is required for audio manipulation.');
    console.error('Windows Download: https://www.gyan.dev/ffmpeg/builds/ (Download the essential.zip)');
    console.error('Mac/Linux: Use `brew install ffmpeg` or `sudo apt install ffmpeg`.\n');
    process.exit(1);
} else {
    console.log(`✅ FFmpeg is installed.`);
}

// 4. Setup Python Virtual Environment
console.log('\n🐍 Setting up Python Virtual Environment (.venv)...');
const venvPath = path.join(process.cwd(), '.venv');

if (!fs.existsSync(venvPath)) {
    try {
        console.log('   Creating .venv...');
        execSync(`${pythonCmd} -m venv .venv`, { stdio: 'inherit' });
    } catch {
        console.error('❌ Failed to create virtual environment.');
        process.exit(1);
    }
} else {
    console.log('   .venv already exists, skipping creation.');
}

// 5. Install Python Dependencies
console.log('📦 Installing Python Dependencies from requirements.txt... (This might take a few minutes)');
const pipCmd = os.platform() === 'win32' 
    ? path.join(venvPath, 'Scripts', 'pip') 
    : path.join(venvPath, 'bin', 'pip');

try {
    execSync(`"${pipCmd}" install -r requirements.txt`, { stdio: 'inherit' });
    console.log('\n✅ Python environment fully set up and dependencies installed!');
} catch {
    console.error('\n❌ Failed to install Python dependencies.');
    process.exit(1);
}

console.log('\n====================================================');
console.log('🎉 Setup Complete! You can now run: npm run dev');
console.log('====================================================\n');
