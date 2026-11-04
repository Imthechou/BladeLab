# BladeLab

手机优先的单局 3D 锻造。每批三块原石，在台面两侧点按翻看。切开后查看纯净度、稳定性和矿脉倾向。按住鼓风、松手散热，让原石经过熔炼球再浇注成坯。

直接点刀身落锤，键盘可以用空格敲击刀腹。刀腹偏纹，刃侧偏膜，刀尖偏特效。第 30 锤断率为 50%，第 45 锤起为 90%。看到值得留下的纹样后可以收锤。装配三选一时仅覆盖柄区。选料、装配和鉴定时可拖动模型。

## 本地运行

需要 Node.js 22+。静态网页可直接部署，无需下载依赖。

```sh
npm start
npm test
```

打开 http://127.0.0.1:8217/。原型使用独立的浏览器本地记录，旧项目的藏刀和信用点数据无需迁移。

## 资产和参考

- 原石、熔炼球、刀胚、12 款刀型的 GLB、柄区划分和 Three.js 加载器来自 [锻刀大赛原项目](https://github.com/Imthechou/blade-forge-3d/tree/c0f64354debed6e7eb7aed6f6877f270ba5174af/game)。刀面材质、铁砧、锤子和合成锤击音为 BladeLab 制作。
- [ForgeTax](https://store.steampowered.com/app/5245810/ForgeTax/) 提供收锤与继续冒险的参考。
- [Valve 武器工艺指南](https://www.counter-strike.net/workshop/workshopfinishes/) 提供金属、纹样与表面处理分层的参考。
