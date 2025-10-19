const { app, BrowserWindow, dialog, Menu, shell, ipcMain } = require("electron")
const express = require("express")
const cors = require("cors")
const axios = require("axios")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")
const path = require("path")

const PORT = 3000
const expressApp = express()

expressApp.use(cors())
expressApp.use(express.json())
expressApp.use(express.static("public"))

const selectedFormat = "mp4"

expressApp.post("/download", async (req, res) => {
  const { url, format } = req.body
  const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`

  try {
    const response = await axios.get(api)
    const data = response.data.data

    if (!data) return res.status(400).json({ error: "Invalid TikTok link." })

    let downloadUrl
    if (format === "mp4") {
      downloadUrl = data.play
    } else {
      downloadUrl = data.music_info?.play || data.music
    }

    if (!downloadUrl) {
      return res.status(400).json({ error: `Unable to get ${format.toUpperCase()} download link.` })
    }

    console.log(`Using ${format.toUpperCase()} URL:`, downloadUrl)

    const currentDate = new Date().toISOString().split("T")[0].replace(/-/g, "")
    const extension = format === "mp4" ? "mp4" : "mp3"
    const defaultFileName = `tiktok_${format}_${currentDate}.${extension}`

    const filters =
      format === "mp4"
        ? [
            { name: "MP4 Videos", extensions: ["mp4"] },
            { name: "All Files", extensions: ["*"] },
          ]
        : [
            { name: "MP3 Audio", extensions: ["mp3"] },
            { name: "All Files", extensions: ["*"] },
          ]

    const filePath = await dialog.showSaveDialog(mainWindow, {
      title: `Save ${format.toUpperCase()} File`,
      defaultPath: defaultFileName,
      buttonLabel: "Save",
      filters: filters,
    })

    if (filePath.canceled) {
      return res.status(400).json({ error: "Download canceled." })
    }

    let finalPath = filePath.filePath
    if (!finalPath.endsWith(`.${extension}`)) {
      finalPath += `.${extension}`
    }

    if (fs.existsSync(finalPath)) {
      const ext = path.extname(finalPath)
      const baseName = path.basename(finalPath, ext)
      const dir = path.dirname(finalPath)
      let counter = 1

      while (fs.existsSync(finalPath)) {
        finalPath = path.join(dir, `${baseName} (${counter})${ext}`)
        counter++
      }
    }

    mainWindow.webContents.send("download-started")

    const downloadStream = await axios({
      url: downloadUrl,
      method: "GET",
      responseType: "stream",
    })

    const totalLength = Number.parseInt(downloadStream.headers["content-length"]) || 0
    let downloadedLength = 0

    const writer = fs.createWriteStream(finalPath)

    downloadStream.data.on("data", (chunk) => {
      downloadedLength += chunk.length
      if (totalLength > 0) {
        const percent = Math.round((downloadedLength / totalLength) * 100)
        mainWindow.webContents.send("download-progress", percent)
      }
    })

    downloadStream.data.pipe(writer)

    writer.on("finish", () => {
      const successMessage = format === "mp4" ? "Video downloaded successfully!" : "Audio downloaded successfully!"

      mainWindow.webContents.send("download-complete", {
        success: true,
        message: successMessage,
        filePath: finalPath,
      })
      res.json({ success: true, message: successMessage })
    })

    writer.on("error", (err) => {
      console.error("Write error:", err)
      mainWindow.webContents.send("download-complete", {
        success: false,
        message: "Download failed.",
      })
      res.status(500).json({ error: "Download failed." })
    })
  } catch (err) {
    console.error("Download error:", err)
    mainWindow.webContents.send("download-complete", {
      success: false,
      message: "Download failed. Please check the TikTok URL and try again.",
    })
    res.status(500).json({ error: "Download failed." })
  }
})

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  mainWindow.loadFile("public/index.html")

  const menu = Menu.buildFromTemplate([
    {
      label: "Exit",
      click: () => {
        app.quit()
      },
    },
    {
      label: "Help",
      submenu: [
        {
        label: 'Know The Dev',
        click: () => {
        shell.openExternal("https://denisxd7.online")
      }},
      ]
    }
  ])
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
  createWindow()

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

expressApp.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
