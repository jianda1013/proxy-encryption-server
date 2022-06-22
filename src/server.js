const httpProxy = require('http-proxy');
const http = require('http');
const express = require('express');
const CryptoJS = require("crypto-js");
const { createDiffieHellman } = require('node:crypto');


const { prime, target, port } = require('./server_config.json');
const proxy = httpProxy.createProxyServer({})
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const keysMap = {};

const server_base = createDiffieHellman(prime, 2);
const master_public_key = server_base.generateKeys().toString("hex");

proxy.on("proxyReq", (proxyReq, req, res) => {
    if (req.method === "POST" && req.body) {
        let bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
    }
})

proxy.on("proxyRes", (proxyRes, req, res) => {
    let body = "";
    proxyRes.on('data', data => {
        data = data.toString('utf-8');
        data = { data: CryptoJS.AES.encrypt(JSON.stringify(data), keysMap[req.ip].toString("hex")).toString() };
        body = JSON.stringify(data);
    });
    proxyRes.on('end', function () {
        res.end(body);
    });
})

proxy.on("error", (err, req, res) => {
    res.end(err.message);
})

app.post('/key_exchange', (req, res) => {
    keysMap[req.ip] = server_base.computeSecret(Buffer.from(req.body.key, "hex"));
    res.json({ key: master_public_key });
})

app.use(async (req, res, next) => {
    if (!keysMap[req.ip])
        res.end('NO KEY');
    else {
        if (req.body && req.body.data) {
            req.body = CryptoJS.AES.decrypt(req.body.data, keysMap[req.ip].toString("hex")).toString(CryptoJS.enc.Utf8);
            req.body = JSON.parse(req.body);
        }
        proxy.web(req, res, { target, selfHandleResponse: true })
    }
});

http.createServer(app).listen(port, '0.0.0.0', () => {
    console.log(`Proxy server linsten on ${port}`);
});