d3.select("#serverField").attr("value", window.location.protocol + "//" + window.location.host + "/solr/");
var query = "*:*";
var showNull = false, showOther = false;
var pivotString, totalSize, selection, color, themeMap, theme;
var server, datasource, primaryFacet, additionalFacets, NUM_ROWS;
var root;

var breadCrumbDims = {
    w: 200, h: 30, s: 3, t: 10
};
var DURATION = 1000;

var svg = d3.select("#mainDisplay"),
    width = +svg.attr("width"),
    height = +svg.attr("height");

d3.select("#themeSelection").on("change", themeSelection);
themeSelection();

d3.selectAll(".toggle").on("change", toggleCheck);

function toggleCheck() {
    if (event.currentTarget.value === "Other")
        showOther = event.currentTarget.checked;
    else
        showNull = event.currentTarget.checked;

    restart()
}

var RADIUS = (Math.min(width, height) / 2);
svg.append("circle")
    .attr("r", RADIUS)
    .attr("opacity", 0);

var x = d3.scaleLinear()
    .range([0, 2 * Math.PI]);

var y = d3.scaleSqrt()
    .range([0, RADIUS]);

var partition = d3.partition();

var arc = d3.arc()
    .startAngle(function (d) {
        return Math.max(0, Math.min(2 * Math.PI, x(d.x0)));
    })
    .endAngle(function (d) {
        return Math.max(0, Math.min(2 * Math.PI, x(d.x1)));
    })
    .innerRadius(function (d) {
        return Math.max(0, y(d.y0));
    })
    .outerRadius(function (d) {
        return Math.max(0, y(d.y1));
    });

initializeBreadcrumbTrail();
// restart();

function restart() {
    clearValues();

    server = d3.select("#serverField").property("value");
    datasource = d3.select("#collectionField").property("value");
    primaryFacet = d3.select("#primaryTypeField").property("value");
    additionalFacets = d3.select("#secondaryFacetField").property("value");
    NUM_ROWS = parseInt(d3.select("#numRows").property("value"));

    svg = d3.select("#mainDisplay").append("g")
        .attr("transform", "translate(" + width / 2 + "," + (height / 2) + ")")
        .attr("class", "sunburst")
        .on("mouseleave", mouseleave);

    dataLoad();
}

function dataLoad() {
    //Construct query from the user given values
    if (additionalFacets.split(",").length > 0)
        var solrQuery = constructQuery(server, datasource, primaryFacet, query, pivotString, additionalFacets.split(","), NUM_ROWS);
    else
        var solrQuery = constructQuery(server, datasource, primaryFacet, query, pivotString, [additionalFacets], NUM_ROWS);


    //Query solr
    var jData = d3.json(solrQuery, {"headers": {"Authorization": "Basic YWRtaW46cGFzc3dvcmQxMjM="}});

    var data = {};
    jData.then(function (response) {
        totalSize = response.response.numFound;
        data["value"] = datasource;
        data["pivot"] = response.facet_counts.facet_pivot[primaryFacet + "," + additionalFacets];
        data["count"] = totalSize;

        function reformatData(data) {
            var otherValue = 0;
            data.field_value = data.value;

            if (data.count)
                data.value = data.count;

            if (data.pivot) {
                for (var i = 0; i < data.pivot.length; i++) {
                    reformatData(data.pivot[i]);
                    otherValue += data.pivot[i].value;
                }
                otherValue = data.value - otherValue;

                if (showOther) {
                    var other = {};
                    other.field = data.pivot[0].field;
                    other.field_value = "other";
                    other.value = otherValue;
                    data.pivot.splice(data.pivot.length - (showNull ? 1 : 0), 0, other);
                }
            }
            return data;
        }

        data = reformatData(data);

        root = d3.hierarchy(data, function (d) {
            return d.pivot;
        });

        var svgUpdate = svg.selectAll('path')
            .data(partition(root).descendants());

        svgUpdate.enter().append('path')
            .on("click", click)
            .on("mouseover", mouseover)
            .transition().duration(DURATION)
            .tween("scale", function () {
                var xd = d3.interpolate([0, 0], x.domain()),
                    yd = d3.interpolate([0, 0], y.domain()),
                    yr = d3.interpolate([0, 0], y.range());
                return function (t) {
                    x.domain(xd(t));
                    y.domain(yd(t)).range(yr(t));
                };
            })
            .attrTween("d", function (d) {
                return function () {
                    return arc(d);
                };
            });

        svg.append("text")
            .attr("x", 0)
            .attr("y", 50)
            .attr("id", "centerText")
            .attr("text-anchor", "middle")
            .attr("pointer-events", "none")
            .attr("font-size", "40px");

        themeSelection();
    })
}

function clearValues() {
    d3.selectAll(".sunburst").remove();
    d3.selectAll(".facetGroup").remove()
}

function click(d) {
    svg = d3.select(".sunburst").on("mouseleave", null);
    console.log(d);
    svg.transition()
        .duration(DURATION)
        .tween("scale", function () {
            var xd = d3.interpolate(x.domain(), [d.x0, d.x1]),
                yd = d3.interpolate(y.domain(), [d.y0, 1]),
                yr = d3.interpolate(y.range(), [d.y0 ? 20 : 0, RADIUS]);
            return function (t) {
                x.domain(xd(t));
                y.domain(yd(t)).range(yr(t));
            };
        })
        .selectAll("path")
        .attrTween("d", function (d) {
            return function () {
                return arc(d);
            };
        });
    setTimeout(function () {
        d3.select(".sunburst").on("mouseleave", mouseleave);
    }, DURATION);
}

function constructQuery(server, datasource, primaryFacet, query, pivotString, additionalFacets, NUM_ROWS) {
    var num = showNull ? NUM_ROWS + 1 : NUM_ROWS;
    var solrQuery = server + datasource + "/select?facet.field=" + primaryFacet + "&facet.sort=count&facet=on&q=" + query + "&rows=0&facet.limit=" + num + "&facet.missing=" + showNull;
    pivotString = "&facet.pivot=" + primaryFacet;
    var pivotLimits = "", pivotMissing = "";
    if (additionalFacets.length > 0) {
        for (var i = 0; i < additionalFacets.length; i++) {
            if (additionalFacets[i].length > 0) {
                pivotString += "," + additionalFacets[i];
                pivotLimits += "&f." + additionalFacets[i] + ".facet.limit=" + num;
                pivotMissing += "&f." + additionalFacets[i] + ".facet.missing=" + showNull;
            }
        }
    }
    solrQuery += pivotString + pivotLimits;
    return solrQuery;
}

function getAncestors(node) {
    var path = [];
    var current = node;
    while (current.parent) {
        path.unshift(current);
        current = current.parent;
    }
    path.unshift(current)
    return path;
}

function initializeBreadcrumbTrail() {
    // Add the svg area.
    var trail = d3.select("#sequence").append("svg:svg")
        .attr("width", width)
        .attr("height", 50)
        .attr("id", "trail");
    // Add the label at the end, for the percentage.
    trail.append("svg:text")
        .attr("id", "endlabel")
        .style("fill", "#000");
}

function updateBreadcrumbs(nodeArray, percentageString) {

    // Data join; key function combines name and depth (= position in sequence).
    var g = d3.select("#trail")
        .selectAll("g")
        .data(nodeArray, function (d) {
            return d.data.field_value + d.depth;
        });

    // Add breadcrumb and label for entering nodes.
    var entering = g.enter().append("svg:g");

    entering.append("svg:polygon")
        .attr("points", breadcrumbPoints)
        .style("fill", decideColor);

    entering.append("svg:text")
        .attr("x", (breadCrumbDims.w + breadCrumbDims.t) / 2)
        .attr("y", breadCrumbDims.h / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .attr("textLength", function (d) {
            if (d.data.field_value) {
                return d.data.field_value.length >= 25 ? 175 : 0
            } else {
                return 0
            }
        })
        .text(function (d) {
            if (d.data.field_value)
                return d.data.field_value;
            else
                return "null";
        });

    // Set position for entering and updating nodes.
    entering.attr("transform", function (d) {
        return "translate(" + d.depth * (breadCrumbDims.w + breadCrumbDims.s) + ", 0)";
    });

    // Remove exiting nodes.
    g.exit().remove();

    // Now move and update the percentage at the end.
    d3.select("#trail").select("#endlabel")
        .attr("x", (nodeArray.length + 0.5) * (breadCrumbDims.w + breadCrumbDims.s))
        .attr("y", breadCrumbDims.h / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text(percentageString);

    // Make the breadcrumb trail visible, if it's hidden.
    d3.select("#trail")
        .style("visibility", "");

}

function breadcrumbPoints(d, i) {
    var points = [];
    points.push("0,0");
    points.push(breadCrumbDims.w + ",0");
    points.push(breadCrumbDims.w + breadCrumbDims.t + "," + (breadCrumbDims.h / 2));
    points.push(breadCrumbDims.w + "," + breadCrumbDims.h);
    points.push("0," + breadCrumbDims.h);
    if (i > 0) { // Leftmost breadcrumb; don't include 6th vertex.
        points.push(breadCrumbDims.t + "," + (breadCrumbDims.h / 2));
    }
    return points.join(" ");
}

function mouseover(d) {

    d3.select("#centerText").text(d.data.field_value);

    var percentage = (100 * d.value / totalSize).toPrecision(3);
    var percentageString = percentage + "%";
    if (percentage < 0.1) {
        percentageString = "< 0.1%";
    }

    d3.select("#percentage")
        .text(percentageString + " of documents in " + datasource + "\nCurrent Field:" + d.data.field + "\tCurrent Value:" + d.data.field_value + "\t# of Documents:" + d.value);

    d3.select("#explanation")
        .style("visibility", "");

    var sequenceArray = getAncestors(d);
    updateBreadcrumbs(sequenceArray, percentageString);

    // Fade all the segments.
    d3.selectAll("path")
        .style("opacity", function (d) {
            return d.parent ? .3 : 1;
        });

    // Then highlight only those that are an ancestor of the current segment.
    svg.selectAll("path")
        .filter(function (node) {
            return (sequenceArray.indexOf(node) >= 0);
        })
        .style("opacity", 1);
}

function mouseleave(d) {
    d3.select("#centerText").text("");
    // Hide the breadcrumb trail
    d3.select("#trail")
        .style("visibility", "hidden");

    // // Deactivate all segments during transition.
    // d3.selectAll("path").on("mouseover", null);

    // Transition each segment to full opacity and then reactivate it.
    d3.selectAll("path")
        .transition()
        .duration(1000)
        .style("opacity", 1);
    // .each("end", function() {
    //     d3.select(this).on("mouseover", mouseover);
    // });

    d3.select("#explanation")
        .style("visibility", "hidden");
}

function themeSelection(d) {
    var colorData = d3.json("../Themes/themes_SolrFacetExplorerSunburst.json");

    if (!selection) {
        colorData.then(function (data) {

            selection = d3.select("#themeSelection");

            for (var key in data) {
                selection.append("option")
                    .property("value", key)
                    .text(key);
            }
            theme = selection.property("options")[0].value;

            themeMap = data;

            setTheme(theme, themeMap);
        });
    }
    else {
        theme = selection.property("options")[selection.property("selectedIndex")].value;
        setTheme(theme, themeMap);
    }

    function setTheme(theme) {
        color = d3.scaleOrdinal().range(themeMap[theme]["colors"]);
        d3.select("body").style("background-color", themeMap[theme]["background"]);

        svg.selectAll('path')
            .style('stroke', themeMap[theme]["background"])
            .style("fill", decideColor);
    }
}

function decideColor(d) {
    if (d.data.field_value !== null) {
        if (d.data.field_value !== "other") {
            return color(d.data.field);
        }
        else if (themeMap[theme]["other"]) {
            return themeMap[theme]["other"];
        }
        else {
            return d3.hsl(color(d.data.field)).brighter(.7).hex();
        }
    }
    else if (themeMap[theme]["null"]) {
        return themeMap[theme]["null"];
    }
    else
        return d3.hsl(color(d.data.field)).brighter(1).hex();
}