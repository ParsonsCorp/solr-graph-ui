d3.select("#serverField").attr("value", window.location.protocol + "//" + window.location.host + "/solr/");
var CURVE = [0, 0],
    MIN_RADIUS = 10,
    MAX_RADIUS = 50,
    NODE_GAP = 30,
    CIRC_RADIUS = 300;
ROTATE = 1.5708;
var query = "*:*";
var node, edgelabels, edgepaths, links = [], nodes = [], allNodes = [], allLinks = [], linksAndLabels, detailsPanel,
    hierarchyCountsMap = {};
var maxCount, minCount;
var pivotString, facets, primaryFacet;

//Color scale used to determine the node/link colors based off of fieldName
var color = d3.scaleOrdinal().range(["#72a555",
    "#ab62c0",
    "#ca5670",
    "#638ccc"]);

//Create the double-range slider
var lowerSlider = d3.select("#lower");
lowerSlider.attr("value", lowerSlider.attr("min"))
    .on("input", lowerSlide);
var upperSlider = d3.select("#upper");
upperSlider.attr("value", upperSlider.attr("max"))
    .on("input", upperSlide);

//Select the SVG in the html and give it basic d3 zooming without the dblclick function
var zoom = d3.zoom()
    .on("zoom", zoomFunction);

var svg = d3.select("svg"),
    width = +svg.attr("width"),
    height = +svg.attr("height");
svg.call(zoom).on("dblclick.zoom", null);

//Function called when the set of data being used is changing
function restart() {
    //Grab values from input text fields
    var server = d3.select("#serverField").property("value");
    var datasource = d3.select("#collectionField").property("value");
    primaryFacet = d3.select("#primaryTypeField").property("value");
    var additionalFacets = collectFacets();
    debugger;
    var timeStampField = d3.select("#timeStampField").property("value");
    var NUM_ROWS = d3.select("#numRows").property("value");

    //Create solr query based on values above
    var solrQuery = server + datasource + "/select?facet.field=" + primaryFacet + "&facet.sort=count&facet=on&q=" + query + "&rows=0&facet.limit=" + NUM_ROWS;
    pivotString = "&facet.pivot=" + primaryFacet;
    var pivotLimits = "";
    if (additionalFacets.length > 0) {
        for (var i = 0; i < additionalFacets.length; i++) {
            if (additionalFacets[i].length > 0) {
                pivotString += "," + additionalFacets[i];
                pivotLimits += "&f." + additionalFacets[i] + ".facet.limit=" + NUM_ROWS;
            }
        }
    }
    solrQuery += pivotString + pivotLimits;

    //Query solr
    var jData = d3.json(solrQuery, {"headers": {"Authorization": "Basic YWRtaW46cGFzc3dvcmQxMjM="}});

    //Everything inside of this .then() function is used to manipulate the data from solr to make it more usable
    jData.then(function (data) {
        allNodes = [];
        allLinks = [];
        nodes = [];

        //Grab all of the top level pivot facets and recursively extract all the nodes from each pivot
        //See extractNodes function for a better understanding of how this works
        facets = data.facet_counts.facet_pivot[pivotString.substr(pivotString.indexOf("=") + 1)];
        var minCount = facets[facets.length - 1].count;
        var maxCount = facets[0].count;
        var nodeIds = [];
        for (var i = 0; i < facets.length; i++) {
            allNodes = allNodes.concat(extractNodes(facets[i], d3.scaleLinear().domain([0, facets.length]).range([0, Math.PI * 2]), d3.scaleLinear().domain([minCount, maxCount]).range([MIN_RADIUS, MAX_RADIUS]), width / 2, height / 2, CIRC_RADIUS, i, null));
        }


        //Link creation
        for (var i = 0; i < allNodes.length; i++) {
            //Create all links from parents to child nodes
            for (var j = 0; j < allNodes.length; j++) {
                if (allNodes[j].parent === allNodes[i].id) {
                    allLinks.push({"source": allNodes[i], "target": allNodes[j]});
                }
            }

            //Create all links from nodes of the same field and value in a circular fashion
            if (nodeIds.indexOf(allNodes[i]["id"].split("|")[0]) === -1) {
                //ANY_NODE.id.split("|")[0] will return <fieldName>:<value> due to the structure of ids
                var nodesToLink = allNodes.filter(n => {
                    return n.id.split("|")[0] === allNodes[i].id.split("|")[0]
                });
                for (var j = 0; j < nodesToLink.length - 1; j++) {
                    allLinks.push({"source": nodesToLink[j], "target": nodesToLink[j + 1]});
                }
                allLinks.push({"source": nodesToLink[0], "target": nodesToLink[nodesToLink.length - 1]});

                //Id list to prevent redrawing links
                nodeIds.push(allNodes[i]["id"].split("|")[0]);
            }
        }

        //Shallow copy allNodes and allLinks arrays
        nodes = allNodes.slice(0);
        links = allLinks.slice(0);
        update();
    });
}

//Function called when data set remains the same, but the presentation of the data ma be different
function update() {
    //Give the details panel access to node data
    detailsPanel = d3.select("#detailsPanel").data(nodes).enter();

    //Create a g element to store all elements that make up links and link labels
    svg.append("g").attr("class", "linksAndLabels");

    //For each link in links, create a g element and bind it to the corresponding links data
    linksAndLabels = svg.select(".linksAndLabels")
        .selectAll("g")
        .data(links, function (d) {
            return d.id;
        });

    //Remove any links that no longer have data associated with them
    //AKA: If the links array has had data removed, remove all the elements associated with the removed data
    linksAndLabels.exit().remove();

    //Finally enter all of the g elements created in Line 210
    linksAndLabels = linksAndLabels.enter().append("g");

    //For each of the g elements in linksAndLabels, create a path based on the link data
    edgepaths = linksAndLabels
        .append('path')
        .attr('class', 'edgepath')
        .attr('id', function (d, i) {
            return 'edgepath' + i
        })
        .attr("stroke", function (d) {
            return color(d.source.id.split(":")[0])
        });

    //Function for how to draw paths
    drawPaths();

    //Adding text labels to paths that will the paths even if they aret straight
    edgelabels = linksAndLabels
        .append('text')
        .attr('class', 'edgelabel')
        .attr('id', function (d, i) {
            return 'edgelabel' + i
        });
    edgelabels.append('textPath')
        .attr('xlink:href', function (d, i) {
            return '#edgepath' + i
        })
        .style("pointer-events", "none")
        .attr("startOffset", "50%")
        .text(function (d) {
            return d.target.count
        });

    //Create a g element to hold all node elements
    svg.append("g")
        .attr("class", "nodes");

    //Same concept as the above with the data(), enter(), and exit() functions used with linksAndLabels
    node = svg.select(".nodes")
        .selectAll("g")
        .data(nodes, function (d) {
            return d.id;
        });
    node.exit().remove();
    node = node.enter().append("g").attr("class", function (d) {
        return "node " + d.fieldName;
    });
    ;


    //Add a circle, title, and text to each of the g elements that represents a node
    node.append("circle")
        .attr("r", function (d) {
            return d.radius;
        })
        .attr("fill", function (d) {
            return color(d.fieldName);
        })
        .attr("cx", function (d, i) {
            return d.x;
        })
        .attr("cy", function (d, i) {
            return d.y;
        })
        //Setting event listeners
        .call(d3.drag()
            .on("start", fade(0.05))
            .on("drag", dragged)
            .on("end", fade(1)))
        .on("dblclick", dblclick);

    node.append("title")
        .text(function (d) {
            return d.id;
        })
        .attr("x", function (d) {
            return d.x;
        })
        .attr("y", function (d) {
            return d.y;
        });

    node.append("text")
        .text(function (d) {
            return d.value + "\n(" + d.count + ")";
        })
        .attr("x", function (d) {
            return d.x;
        })
        .attr("y", function (d) {
            return d.y;
        })
        .attr("class", "nodeLabel");
}

/**
 @params
 node = JSON object from solr representing a facet field with a certain value
 angleScale = scale used for 0-2*PI radian placement of nodes
 radiusScale = scale used for placement around point centerX,centerY
 centerX = x coord of center point for node placement
 centerY = y coord of center point for node placement
 radius = radius of circle used for node placement
 index = the nodes index inside either Solr's facet_pivot or inside SOME_NODE.pivot
 parent = the current nodes parent
 */
function extractNodes(node, angleScale, radiusScale, centerX, centerY, radius, index, parent) {
    var nodesArray = [];
    var tempNode = {};

    //Setting all simple properties
    tempNode["count"] = node.count;
    tempNode["fieldName"] = node.field;
    tempNode["value"] = node.value;
    tempNode["x"] = ((radius + NODE_GAP) * Math.cos(angleScale(index) - ROTATE)) + centerX;
    tempNode["y"] = ((radius + NODE_GAP) * Math.sin(angleScale(index) - ROTATE)) + centerY;
    tempNode["radius"] = radiusScale(node.count);
    tempNode["open"] = true;

    //Populate the parent node with children if there is a parent node; set IDs
    if (parent) {
        tempNode["id"] = node.field + ":" + node.value + "|(" + node.count + ")||" + parent.id;
        tempNode["parent"] = parent["id"] || null;
        if (parent["children"]) {
            parent["children"].push(node.field + ":" + node.value)
        }
        else {
            parent["children"] = [node.field + ":" + node.value];
        }
    }
    else {
        tempNode["id"] = node.field + ":" + node.value + "|(" + node.count + ")";
    }

    //Add the current node to the array
    nodesArray.push(tempNode);

    //If the node has children, recursively call extractNodes on each of them
    if (node.pivot) {
        var newAngleScale = d3.scaleLinear().domain([0, node.pivot.length]).range([0, Math.PI * 2]);


        var newRadiusScale = d3.scaleLinear().domain([node.pivot[node.pivot.length - 1].count === node.pivot[0].count ? 0 : node.pivot[node.pivot.length - 1].count, node.pivot[0].count]).range([radiusScale.range()[0] / 2, tempNode["radius"] / 2]);
        for (var i = 0; i < node.pivot.length; i++) {
            nodesArray = nodesArray.concat(extractNodes(node.pivot[i], newAngleScale, newRadiusScale, tempNode["x"], tempNode["y"], tempNode["radius"], i, tempNode));
        }
    }

    return nodesArray;
}

function collectFacets() {
    return d3.select("#secondaryFacetField").property("value").split(",");
}

function checkRange(rangeField) {
    var newNodes = allNodes.filter(node => node.hierarchy_level_i >= parseInt(lowerSlider.attr("value")) && node.hierarchy_level_i <= parseInt(upperSlider.attr("value")));
    return newNodes;
}

function lowerSlide() {
    var lowerVal = parseInt(this.value);
    var upperVal = parseInt(this.parentNode.lastElementChild.value);

    if (lowerVal > upperVal - 1) {

        this.parentNode.lastElementChild.value = lowerVal;

        if (upperVal === parseInt(upperSlider.attr("max"))) {
            this.value = parseInt(upperSlider.attr("max"));
        }
    }
    lowerSlider.attr("value", this.value);
    upperSlider.attr("value", this.parentNode.lastElementChild.value);
    // clearValues();
    update();
}

function upperSlide() {
    var lowerVal = parseInt(this.parentNode.firstElementChild.value);
    var upperVal = parseInt(this.value);

    if (upperVal < lowerVal) {
        this.parentNode.firstElementChild.value = upperVal;

        if (lowerVal === parseInt(lowerSlider.attr("min"))) {
            this.value = 1;
        }
    }
    lowerSlider.attr("value", this.parentNode.firstElementChild.value);
    upperSlider.attr("value", this.value);
    // clearValues();
    update();
}

function facetFilter() {
    query = facetField + ":" + this.id;
    d3.selectAll(".facet").remove();
    clearValues();
    restart();
}

function resetQuery() {
    query = "*:*";
    d3.selectAll(".facet").remove();
    clearValues();
    restart();
}

function clearValues() {
    d3.selectAll(".nodes").remove();
    d3.selectAll(".linksAndLabels").remove();
    zoom.transform(svg, d3.zoomIdentity);
}

function zoomFunction() {
    if (node) {
        node.attr("transform", d3.event.transform);
        linksAndLabels.attr("transform", d3.event.transform);
    }
}

function fade(opacity) {
    return d => {

        node.style('stroke-opacity', function (o) {
            const thisOpacity = isConnected(d, o) ? 1 : opacity;
            this.setAttribute('fill-opacity', thisOpacity);
            this.lastElementChild.style.opacity = (thisOpacity !== opacity) ? "1" : "";
            return thisOpacity;
        });

        if (opacity !== 1) {
            d3.selectAll(".detail").remove();
            for (var prop in d) {
                if (prop !== "children") {
                    d3.select("#detailsPanel").append("p").attr("class", "detail").text(prop + ": " + d[prop]);
                }
            }
        }
        linksAndLabels.style('opacity', o => {
            debugger;
            return (o.source.value === d.value || o.target.value === d.value || o.source === d || o.target === d ? 1 : opacity)
        });
    };
}

function isConnected(nodeOne, nodeTwo) {
    if (nodeOne === nodeTwo) {
        return true;
    }

    for (var i = 0; i < links.length; i++) {
        if (links[i].source.id === nodeOne.id && links[i].target.id === nodeTwo.id || links[i].source.id === nodeTwo.id && links[i].target.id === nodeOne.id) {
            return true;
        }

        if (nodeOne.id === nodeTwo.parent) {
            return true;
        }

        if (nodeOne.children && nodeOne.children.indexOf(nodeTwo.id.split("|")[0]) !== -1) {
            return true;
        }

        if (nodeOne.id.split("|")[0] === nodeTwo.id.split("|")[0]) {
            return true;
        }
    }
    return false;
}

function drawPaths() {
    linksAndLabels.selectAll(".edgepath").attr('d', function (d) {
        // return "M" + d.source.x + "," + d.source.y + "C" + (d.source.x-CURVE[0]) + "," + (d.source.y-CURVE[1]) + " " + (d.target.x-CURVE[0]) + "," + (d.target.y-CURVE[1]) + " " + d.target.x + "," + d.target.y;
        // return "M" + d.source.x + "," + d.source.y + "L" + d.target.x + "," + d.source.y + " " + "L" + d.target.x + "," + d.target.y;
        return "M" + d.source.x + "," + d.source.y + "Q" + d.source.x + "," + d.source.y + "," + d.target.x + "," + d.target.y;
    });
}

function dragged(d) {
    d3.select(this.parentNode).select("circle").attr("cx", d.x = d3.event.x).attr("cy", d.y = d3.event.y);
    d3.select(this.parentNode).select("text").attr("x", d.x).attr("y", d.y);
    drawPaths();
}

function dblclick(d) {
    if (d.open) {
        d.open = false;
        collapse(d);
    }
    else {
        d.open = true;
        expand(d);
    }
    clearValues();
    update();
}

function collapse(d) {
    var removedLinks = [];
    for (var i = links.length - 1; i >= 0; i--) {
        if (links[i].source === d || (d === links[i].target && links[i].source.value === links[i].target.value)) {
            removedLinks.push(links[i]);
            links.splice(i, 1);
        }
    }
    for (var i = nodes.length - 1; removedLinks.length > 0 && i >= 0; i--) {
        removedLinks = removedLinks.filter(l => {
            if (l.target === nodes[i] && l.target.fieldName !== l.source.fieldName) {
                var temp = nodes[i];
                nodes.splice(i, 1);
                collapse(temp);
                return false;
            }
            return true;
        })
    }
}

function expand(d) {
    var returningNodes = allNodes.filter(n => {
        if (n.parent === d.id) {
            expand(n);
            return true;
        }
    });
    nodes = nodes.concat(returningNodes);

    var returningLinks = allLinks.filter(link => {
        return (returningNodes.indexOf(link.target) !== -1 && nodes.indexOf(link.source) !== -1 || returningNodes.indexOf(link.source) !== -1 && nodes.indexOf(link.target) !== -1);
    });
    links = links.concat(returningLinks);
}

function toggleLabels() {

    d3.selectAll("textPath").attr("class", "visibleLabel");
}