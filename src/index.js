const AES = require("crypto-js").AES;
const httpProxy = require('http-proxy');
const http = require('http');
const express = require('express');

const proxy = httpProxy.createProxyServer({})
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

proxy.on("proxyReq", (proxyReq, req, res) => {
    if (req.method === "POST" && req.body) {
        let bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
    }
})

proxy.on("proxyRes", (proxyRes, req, res) => {
    proxyRes.on("data", (buffer) => {
        let data = buffer.toString('utf8');
        console.log(data);
    })
})

app.use((req, res) => {
    req.body = { data: AES.encrypt(JSON.stringify(req.body), "test").toString() };
    proxy.web(req, res, { target: 'http://127.0.0.1:8181' })
});

http.createServer(app).listen(1337, '0.0.0.0', () => {
    console.log('Proxy server linsten on 1337');
});