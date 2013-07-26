# OpenWiFiMap CouchApp

This is a skeleton for pushing the HTML files of openwifimap-html5 along with its dependencies into a CouchDB (see [CouchApp](http://couchapp.org/page/index)).

## How to install
1. Clone this CouchApp skeleton and change into the directory: 
```
git clone -b couchapp git@github.com:freifunk/openwifimap-html5.git openwifimap-html5-couchapp
cd openwifimap-html5-couchapp
```
2. Clone the HTML app into `_attachments`:
`git clone -b gh-pages git@github.com:freifunk/openwifimap-html5.git _attachments`
3. Adapt the `couchurl` variable in `_attachments/script/owm_app.js` and `_attachments/map.html` to point to your [OpenWiFiMap API](https://github.com/freifunk/openwifimap-api).
4. Push it with the [couchapp](http://couchapp.org/page/index) or [erica](https://github.com/benoitc/erica) tool:
`erica push http://USER:PASS@HOST/DBNAME`
5. Create a vhost entry in CouchDBs configuration for nice URLs. Let's assume that the domain `awesomemap.net` points to your CouchDB. Then the config option with section `vhost`, option `awesomemap.net` and value `DBNAME/_design/owm-html5/_rewrite` lets you access the map via `http://awesomemap.net/` instead of `http://HOST/DBNAME/_design/owm-html5/index.html`.
