const fs = require('fs')
const https = require('https')
const express = require('express')
const bodyParser = require('body-parser')

const app = express()
const MOPIDY_HOST = 'http://localhost:6680/mopidy/rpc'
app.use(bodyParser.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

const verifyChannel = (req, res, next) => {
  if (req.body.channel_name !== 'cts-la-music') {
    res.status(200)
  } else {
    next()
  }
}
app.use(verifyChannel)

const commandEncode = {
  queue: 'core.TracklistController.add',
  skip: 'core.PlaybackController.next',
  volume: 'core.MixerController.set_volume',
  getPlaybackState: 'core.PlaybackController.get_state',
  setPlaybackState: 'core.PlaybackController.set_state',
}

const paramEncode = (command, arg) => {
  switch (command) {
    case 'queue': return { uri: arg }
    case 'volume': return { volume: arg }
    default: throw new Error('invalid parameter')
  }
}

const mopidyCommand = (() => {
  let commandId = 1

  return (command, arg) => {
    const body = {
      jsonrpc: '2.0',
      id: commandId,
      method: commandEncode[command],
    }
    if (arg) {
      body.params = paramEncode(command, arg)
    }
    commandId += 1

    return fetch(MOPIDY_HOST, { method: 'POST', body })
      .then(res => res.json())
      .then(({ error, result }) => {
        if (error) {
          return Promise.reject(error.message)
        }
        return result
      })
  }
})()

app.post('/play', (req, res) => {
  // TODO play a specific URI
  mopidyCommand('getPlaybackState')
    .then((playbackState) => {
      if (playbackState === 'stopped' || playbackState === 'paused') {
        return mopidyCommand('setPlaybackState', 'playing')
      }
      return null
    })
    .then(() => res.status(200))
    .catch(err => res.status(500).send(err))
})

app.post('/queue', (req, res) => {
  mopidyCommand('queue', req.body.text)
    .then(() => res.status(200))
    .catch(err => res.status(500).send(err))
})

app.post('/pause', (req, res) => {
  mopidyCommand('setPlaybackState', 'paused')
    .then(() => res.status(200))
    .catch(err => res.status(500).send(err))
})

app.post('/skip', (req, res) => {
  mopidyCommand('skip')
    .then(() => res.status(200))
    .catch(err => res.status(500).send(err))
})

app.post('/volume', (req, res) => {
  mopidyCommand('volume', req.body.text)
    .then(() => res.status(200))
    .catch(err => res.status(500).send(err))
})

const httpsOptions = {
  key: fs.readFileSync('path/to/private.key'),
  cert: fs.readFileSync('path/to/certificate.pem'),
}
https.createServer(httpsOptions, app).listen(443, () => {
  console.log('slack-mopidy listening on port 443')
})
