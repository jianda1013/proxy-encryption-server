const httpProxy = require('http-proxy');
const http = require('http');
const express = require('express');
let CryptoJS = require("crypto-js");

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
    let _write = res.write, output, body = "";
    proxyRes.on('data', data => {
        data = JSON.parse(data.toString('utf-8'))?.data;
        data = CryptoJS.AES.decrypt(data, "test").toString(CryptoJS.enc.Utf8);
        body += data;
    });
    res.write = () => {
        eval("output=" + body)
        res.setHeader('content-length', output.length);
        _write.call(res, output);
    }
})

app.use((req, res) => {
    req.body = { data: CryptoJS.AES.encrypt(JSON.stringify(req.body), "test").toString() };
    proxy.web(req, res, { target: 'http://127.0.0.1:8080' })
});

http.createServer(app).listen(1337, '0.0.0.0', () => {
    console.log('Proxy client linsten on 1337');
});