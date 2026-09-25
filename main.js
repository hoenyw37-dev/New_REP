const electron = require('electron');
const path = require('path')
const fs = require('fs');
electron.app.disableHardwareAcceleration();
require('@electron/remote/main').initialize();

const devMode = true;
const localzoomValue = 0.8;
let url;
let hasToken;
let mainWindow;
let authWindow;
let signOutWindow;
let server;

// create the sign in window
const SignInWindowConfig = {
  width: 800,
  height: 700,
  minWidth: 800,
  minHeight: 700,
  show: false,
  autoHideMenuBar: true,
  parent: mainWindow,
  modal: true,
  webPreferences: {
    nodeIntegration: false,
    enableRemoteModule: false,
    devTools: devMode
  }
};


const isMac = process.platform === 'darwin'

/**
 * lock for single instance
 */
const additionalData = { clssKey: 'clssconfigurationTool' }
const gotTheLock = electron.app.requestSingleInstanceLock(additionalData)

if (!gotTheLock) {
  electron.app.quit()
} else {
  electron.app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}


/**
 * Create window and load application inside
 */
function createWindow() {
  url = require('url').format({
    pathname: path.join(__dirname, 'build', 'index.html'),
    protocol: 'file:',
    slashes: true
  });
  let winConfig = {
    width: 1200,
    height: 680,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      devTools: devMode,
      zoomFactor: localzoomValue
    }
  }
  mainWindow = new electron.BrowserWindow(winConfig);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);
  mainWindow.maximize();
  mainWindow.loadURL(url);

  // Add possibility to open DevTools (ctrl + H) in developer mode only
  if (devMode) {
    electron.globalShortcut.register('CommandOrControl+H', () => mainWindow.webContents.toggleDevTools());
  }

  require("@electron/remote/main").enable(mainWindow.webContents);
  mainWindow.once('ready-to-show', () => {
    mainWindow.webContents.zoomFactor = localzoomValue;
    writeLog('SettingZoomFactor in ready-to-show');
    writeLog(mainWindow.webContents.getZoomFactor());

    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    electron.app.quit();
    mainWindow = null
  });

  mainWindow.on('focus', () => {
    mainWindow.webContents.zoomFactor = localzoomValue;
    writeLog('SettingZoomFactor in focus');
    writeLog(mainWindow.webContents.getZoomFactor());
  });
}

electron.app.on('ready', startApi);

/* MacOS support */
electron.app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
electron.app.on('window-all-closed', () => electron.app.quit());

const os = require('os');
var apiProcess = null;
var apiProcess2 = null;

function startApi() {
  startApi2();
  var proc = require('child_process').spawn;
  //  run server
  var backendPath = path.join(__dirname, '../Honeywell.FTS.WebAPI.Server/Honeywell.FTS.WebAPI.Server');
  writeLog(os.platform());
  if (os.platform() === 'darwin') {
    writeLog(fs.readdirSync(path.join(__dirname, "../Honeywell.FTS.WebAPI.Server/")));
  }
  else {
    writeLog(fs.readdirSync(path.join(__dirname, "..\\Honeywell.FTS.WebAPI.Server\\")));
  }

  writeLog("spawned!");
  try {
    apiProcess = proc(backendPath);
    createWindow();
    apiProcess.stdout.on('data', (data) => {
      writeLog(`${data}`);
      if (mainWindow == null) {
        writeLog('window created');
      }
    });

  }
  catch (err) {
    writeLog(err.message);
  }
}

function startApi2() {
  var proc2 = require('child_process').spawn;
  //  run server
  var backendPath = path.join(__dirname, '../Honeywell.CLSSCTS.WebAPI.Server/Honeywell.CLSSCTS.WebAPI.Server');
  writeLog(os.platform());
  if (os.platform() === 'darwin') {
    writeLog(fs.readdirSync(path.join(__dirname, "../Honeywell.CLSSCTS.WebAPI.Server/")));
  }
  else {
    writeLog(fs.readdirSync(path.join(__dirname, "..\\Honeywell.CLSSCTS.WebAPI.Server\\")));
  }
  writeLog("spawned! started");
  try {
    apiProcess2 = proc2(backendPath);
    apiProcess2.stdout.on('data', (data) => {
      writeLog(`${data}`);
      if (mainWindow == null) {
        writeLog('window created');
      }
    });
  }
  catch (err) {
    writeLog(err.message);
  }
}

//Kill process when electron exits
process.on('exit', function () {
  writeLog('exit');
  apiProcess.kill();
  apiProcess2.kill();
});

function writeLog(msg) {
  if (devMode) {
    console.log(msg);
  }
}

// function to get token details and send to oid service
function getTokenFromSignInWindow(browserWindow, acquireTokenEvent) {
  writeLog('get the token from sign in window');
  return new Promise(resolve => {
    browserWindow.addListener('close', () => resolve(false));
    browserWindow.addListener('page-title-updated', event => {
      const uri = browserWindow.webContents.getURL() || '';
      if (uri.toLowerCase().includes('?code')) {
        hasToken = true;
        acquireTokenEvent.sender.send('access_token', uri);
        return;
      }
      if (uri.toLowerCase().includes('?error=')) {
        acquireTokenEvent.sender.send('access_token', 'close');
        return;
      }
    });
  });
}

function createSignInWindow(event, authUrl) {
  writeLog('Create SignIn window');
  authWindow = new electron.BrowserWindow(SignInWindowConfig);
  authWindow.minimizable = false;
  authWindow.setParentWindow(mainWindow);  
  authWindow.on('close', function (evt) {
    electron.app.quit();
  });

  if (authWindow != null && authWindow.isDestroyed() == false) {
    authWindow.loadURL(authUrl);
    getTokenFromSignInWindow(authWindow, event);
    authWindow.on('page-title-updated', (event, arg) => {
      authWindow.show();
    });
  }
}

//start server
electron.ipcMain.on('loadSignIn', (event, arg) => {
  clearCookies(arg).then(() => {
    writeLog('Load the SignIn page');
    createSignInWindow(event, arg);
    server = require("http").createServer(function (req, res) {
      res.end(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>LogIn Success</title>
      </head>
      <body>
      </body>
      </html>
      `, "utf8");
    });
    server.listen(9430);
  });
});

electron.ipcMain.on('loadSignout', (event, arg) => {
  writeLog('Load the SignOut page');
  signOutWindow = new electron.BrowserWindow(SignInWindowConfig);
  signOutWindow.minimizable = false;
  signOutWindow.setParentWindow(mainWindow);
  signOutWindow.loadURL(arg);
  addListenerForLogOut(signOutWindow, event);
});

electron.ipcMain.on('close-window', (event, arg) => {
  writeLog('Close the window');
  server.close();
  setImmediate(function () {
    server.emit('close');
  });
  if (authWindow != null && authWindow.isDestroyed() == false) {
    authWindow.destroy();
  }
  event.sender.send('authWindowClosed');
});

electron.ipcMain.on('closeSignoutWindow', (event, arg) => {
  writeLog('Close the SignOut window');
  if (signOutWindow != null && signOutWindow.isDestroyed() == false) {
    signOutWindow.destroy();
  }
  signOutWindow = null;
  event.sender.send('signoutWindowClosed');
});

electron.ipcMain.on('restart_app', () => {
  electron.app.relaunch();
  electron.app.exit();
});

function addListenerForLogOut(signout_Window, logoutEvent) {
  writeLog('add listener for log out');
  return new Promise(resolve => {
    signout_Window.addListener('page-title-updated', event => {
      logoutEvent.sender.send('pageTitleUpdated');
      return;
    });
  })
}

function clearCookies(url){
  return new Promise((resolvePromise, reject)=>{
    try {
      electron.session.defaultSession.cookies.get({url: url}).then((cookies) => {
        if(!cookies || cookies.length == 0){
          resolvePromise();
        } else if(cookies && cookies.length > 0){
          var promises = [];
          cookies.forEach((cookie, index)=>{
            promises.push( electron.session.defaultSession.cookies.remove(url, cookie.name));
          });
          Promise.all(promises).then(() => {
            resolvePromise();
          }, ()=> {resolvePromise();});
        } else {
          resolvePromise();
        }
      }, ()=> {
        resolvePromise();
      });
    } catch {
      resolvePromise();
    }
  });
}

electron.ipcMain.on('loadBrowserLink', (event, arg)=>{
  writeLog('In loadBrowserLink listener');
  electron.shell.openExternal(arg);
})

electron.ipcMain.on('loadPrivacyStatementLink', (event, arg)=>{
  writeLog('In loadPrivacyStatementLink listener');
  electron.shell.openExternal(arg);
})
