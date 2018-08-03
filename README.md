# D3 Graph Visualization for Solr Facet Data

Solr facets are one of the most powerful analytic capabilities offered by Apache Solr. These files provide a couple of attractive and convenient visualizations for that data.



## License
Apache 2.0


## Installation
Simply clone this repository into a working directory, such as `/home/me/dev/solr-graph-ui`,
or into the `$SOLR_HOME/server/solr-webapp/webapp/solr-graph-ui` folder of your Solr servelet container.

If CORS is not enabled on the Solr server(s) that you want to target, this repository must be put on the same server that is hosting Solr.

## Basic configuration

Once deployed, either of the files in the `Views` directory can be loaded into your browser directly.
`http://server:8983/solr/solr-graph-ui/Views/SolrFacetExplorerSunburst.html` or 
`http://server:8983/solr/solr-graph-ui/Views/SolrFacetExplorerCircles.html`
