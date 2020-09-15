const express = require('express');
const scraper = require('./scraper')
const app = express();
const puppeteer = require('puppeteer');

// var timeout = express.timeout // express v3 and below
var timeout = require('connect-timeout'); //express v4

// app.use(haltOnTimedout);

// function haltOnTimedout(req, res, next){
//   if (!req.timedout) next();
// }
//Home page
app.get('/', (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

//API route
app.get('/api/search', async (req, res) => {
  const browser = await puppeteer.launch();
  scraper.youtube(browser, req.query.q, req.query.page)
        .then(x => res.json(x))
        .catch(e => res.send(e));
        
  await browser.close();
});

app.use(timeout(120000));
app.listen(process.env.PORT || 3000, function () {
  console.log('Listening on port 3000');
});

module.exports = app;
