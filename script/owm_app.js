//////////////////////////////////////////////////////////
// jquery mobile page + parameter handling

// this function is free software, Copyright (c) 2011, Kin Blas
// see https://github.com/jblas/jquery-mobile-plugins/blob/master/page-params/jqm.page.params.js
function queryStringToObject( qstr )
{
  var result = {},
      nvPairs = ( ( qstr || "" ).replace( /^\?/, "" ).split( /&/ ) ),
      i, pair, n, v;

  for ( i = 0; i < nvPairs.length; i++ ) {
    var pstr = nvPairs[ i ];
    if ( pstr ) {
      pair = pstr.split( /=/ );
      n = pair[ 0 ];
      v = pair[ 1 ];
      if ( result[ n ] === undefined ) {
        result[ n ] = v;
      } else {
        if ( typeof result[ n ] !== "object" ) {
          result[ n ] = [ result[ n ] ];
        }
        result[ n ].push( v );
      }
    }
  }

  return result;
}

//////////////////////////////////////////////////////////
// general functions
function getPopupHTML(nodedata) {
  return ich.mappopupmust(nodedata, true);
}

// obj may be an object or a list
function scanListsObj(obj) {
  if (obj instanceof Array) {
    for (var i=0; i<obj.length; i++) {
      scanListsObj(obj[i]);
    }
    return obj.length>0
  }
  if (obj instanceof Object) {
    for (var key in obj) {
      var val = obj[key];
      if (scanListsObj(val)) {
        obj[String(key)+"?"] = true;
      }
    }
    return false;
  }
}

function latlng2lnglat(latlng) {
  return [latlng[1], latlng[0]];
}

function validateNode(nodedata) {
  // ignore this node if mtime older than 7 days
  var date = new Date();
  date.setHours(date.getHours() - 24*7);
  var nodedate = new Date(nodedata['mtime']);
  return nodedate > date;
}

(function() {
  var couchurl = 'api/';

  //////////////////////////////////////////////////////////
  // map page
  $(document).on('pageshow', '#map', function() {
    var mappage = $('#map');
    var bbox=null;
    var pd = $.mobile.pageData;
    if (pd && pd.bbox && typeof pd.bbox == "string") {
      bbox = getBboxFromString(pd.bbox);
    }

    function onBboxChange(bboxstr) {
      var currentPageID = $.mobile.activePage == null ? 'map' : $.mobile.activePage.attr('id');
      if (currentPageID=='map') {
        params.sethash( '#map?bbox=' + bboxstr );
        $("a#listlink").attr('href', '#list?bbox=' + bboxstr);
      }
    }

    var owmwidget = mappage.data('owmwidget');
    if (!owmwidget) {
      owmwidget = new OWMWidget(
          {
            divId: 'mapdiv',
            onBboxChange: function(bbox) {
              onBboxChange(bbox.toString());
            },
            getPopupHTML: function(nodedata) {
              return ich.mappopupmust(nodedata, true);
            }
          },
          {
            trackResize: false
          },
          {
            couchUrl: couchurl, coarseThreshold: 1000,
            nodeFilter: validateNode
          }
        );
      mappage.data('owmwidget', owmwidget);

      function onResize() {
        var currentPageID = $.mobile.activePage == null ? 'map' : $.mobile.activePage.attr('id');
        if (currentPageID=='map') {
          // This hack is needed as long as 100% height in css is f**ked up.
          // The height is not set to 100% at this point but so something else,
          // so zooming is screwed up without the hack.
          var cur_height = $('#mapdiv').height();
          var new_height =
              $(window).height()
              - $('#map div[data-role="header"]').outerHeight()
              - $('#map div[data-role="footer"]').outerHeight();
          $('#mapdiv').height( new_height );
          owmwidget.map.invalidateSize();
        }
      }
      $(window).on("pageshow resize", onResize);
      onResize();

      if (!bbox) {
        owmwidget.map.fitWorld();
        owmwidget.map.locate({setView: true, maxZoom: 15, timeout: 20000})
          .on('locationerror', function(e) { console.log('location NOT found', e) })
          .on('locationfound', function(e) { console.log('location found', e) });
      }
    }

    if (bbox) {
      owmwidget.fitBbox(bbox);
    }

    $.getJSON("https://api.github.com/repos/freifunk/openwifimap-html5/contributors",
        function (data) {
          var html = ich.about_contrib_must({contributors:data}, true);
          $("#about_contrib").empty().append(html);
        });
  });


  //////////////////////////////////////////////////////////
  // list page
  function listUpdate(data) {
    var html;
    if (!data) {
      html = "<h3>No area selected! Go to the <a href=\"#map\">map</a> to find nodes.</h3>";
    } else if (!data.nodes.length) {
      html = "<h3>No nodes in selected area! Go to the <a href=\"#map\">map</a> to find nodes.</h3>";
    } else {
      html = ich.listmust(data);
    }
    $("#listdiv").empty().append(html);
    var listul = $("#listul");
    if (listul.hasClass('ui-listview')) {
      listul.listview('refresh');
    } else {
      listul.listview();
    }
  }

  $(document).on('pagebeforeshow', '#list', function (){
    var bbox = null;
    var pd = $.mobile.pageData;
    if (pd && pd.bbox && typeof pd.bbox == "string") {
      bbox = getBboxFromString(pd.bbox);
    }
    if (bbox) {
      $("a#maplink").attr("href", "#map?bbox=" + bbox.toString());
      var bboxlnglat = [latlng2lnglat(bbox[0]), latlng2lnglat(bbox[1])].toString();
      $.getJSON(couchurl + 'view_nodes_spatial',
        {
          "bbox": bboxlnglat,
          limit: 500 // note that due to the mtime check the actual
                     // number of displayed nodes may be lower
        }, function(data) {
        var nodes = [];
        for (var i=0; i<data.rows.length; i++) {
          var node = data.rows[i].value;
          if (validateNode(node)) {
            nodes.push(node);
          }
        }
        listUpdate({bbox: bbox.toString(), nodes: nodes});
      });
    } else {
      listUpdate();
    }
  });


  //////////////////////////////////////////////////////////
  // detail page

  function detailmapResize() {
    var currentPageID = $.mobile.activePage == null ? 'map' : $.mobile.activePage.attr('id');
    if (currentPageID=='detail') {
      var map = $("#detailmap");
      width = ( $(document).width() < 500 ) ? '100%' : '50%';
      $('#detailmapcontainer').css('width', width);
      $('#detailaddrcontainer').css('width', width);
      map.height( map.width()*0.8 );
      var detailpagemap = $('#detail').data('map');
      if (detailpagemap) {
        detailpagemap.map.invalidateSize();
      }
    }
  }

  $(window).on("pageshow resize", detailmapResize);

  $(document).on('pagebeforeshow', '#detail', function () {
    var detailpage = $('#detail');

    var bbox = null;
    var pd = $.mobile.pageData;
    if (pd && pd.bbox && typeof pd.bbox == "string") {
      bbox = getBboxFromString(pd.bbox);
    }
    if (bbox) {
      $("a#detailback").attr("href", "#list?bbox=" + bbox.toString() );
      $("a#detailback .ui-btn-text").text("List");
    } else {
      $("a#detailback").attr("href", "#map" );
      $("a#detailback .ui-btn-text").text("Map");
    }

    node = null;
    if (pd && pd.node && (typeof pd.node == "string")) {
      node = pd.node;
    }
    if (node) {
      $.getJSON(couchurl + 'db/' + node, {}, function(data) {
        var mapdiv = null;
        var detailpagemap = detailpage.data('map');
        if (detailpagemap) {
          mapdiv = $("#detailmap").detach();
        }
        // i can haz detailed data?
        scanListsObj(data);
        data.couchurl = couchurl + '../..';
        $("#detaildiv").empty().append( ich.detailmust(data) ).trigger('create');

        // i can haz avatar?
        var avatarurl = null;
        if (data._attachments) {
          Object.keys(data._attachments).forEach( function(key) {
            // limit avatars to 150kB
            if ( (/^avatar\.(png|jpg)$/).test(key) && data._attachments[key].length<150000) {
              avatarurl = "/openwifimap/" + data._id + "/" + key;
            }
          });
        }
        if (avatarurl) {
          $("#avaframe").empty().append( '<img id="avatar" src="' + avatarurl + '" />' );
        }

        if (!detailpagemap) {
          detailpagemap = new OWMWidget(
              {
                divId: 'detailmap',
                onBboxChange: function(bboxstr) {},
                getPopupHTML: function(nodedata) {
                  return ich.mappopupmust(nodedata, true);
                }
              },
              {
                trackResize: false
              },
              {
                couchUrl: couchurl, coarseThreshold: 1000,
                nodeFilter: validateNode
              }
            );
          detailpage.data('map', detailpagemap);
        } else {
          $("#detailmapcontainer").empty().append(mapdiv);
        }
        detailmapResize();
        detailpagemap.map.setView([data.latitude,data.longitude], 16);
        $("#detailmapcenter").click( function () {
          detailpagemap.map.setView([data.latitude,data.longitude], 16);
        });
      });
    } else {
      $("#detaildiv").empty().append("<h3>No node selected! Go to the <a href=\"#map\">map</a> to find nodes.</h3>");
    }
  });
})();
