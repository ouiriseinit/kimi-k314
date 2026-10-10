const express = require('express')
const cors = require('cors')
const path= require('path')

const app = express()
const port = 3000

app.use(cors())
app.use(express.static(path.join(__dirname, 'public')))

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.post('/', (req, res) => {
    console.log(req.body)

    res.send('Got a POST request')
})

app.put('/user', (req, res) => {
  console.log(req.body)
  res.send('Got a PUT request at /user');
});

app.delete('/user', (req, res) => {
  console.log(req.body)
  res.send('Got a DELETE request at /user');
});

app.listen(port, () => {
  console.log(req.body)
    console.log('http://localhost:' + port)
})