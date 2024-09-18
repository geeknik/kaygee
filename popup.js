let network;
let resizeObserver;

document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup DOM loaded');
  initializeGraph();
});

function initializeGraph() {
  console.log('Initializing graph');
  try {
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const fit = document.getElementById('fit');
    
    if (!zoomIn || !zoomOut || !fit) {
      throw new Error('One or more control buttons not found');
    }
    
    zoomIn.addEventListener('click', () => zoomGraph(1.2));
    zoomOut.addEventListener('click', () => zoomGraph(0.8));
    fit.addEventListener('click', fitGraph);

    // Set up ResizeObserver
    const graphContainer = document.getElementById('graph-container');
    if (!graphContainer) {
      throw new Error('Graph container not found');
    }
    
    resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (network) {
          network.setSize(entry.contentRect.width, entry.contentRect.height);
          network.redraw();
        }
      }
    });
    resizeObserver.observe(graphContainer);

    // Scrape the current page and create the graph
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        function: scrapePageData,
      }, function(results) {
        if (chrome.runtime.lastError) {
          handleError(chrome.runtime.lastError.message);
        } else if (results && results[0]) {
          const pageData = results[0].result;
          const graphData = createGraphData(pageData);
          displayGraph(graphData);
        }
      });
    });

  } catch (error) {
    console.error('Error initializing graph:', error);
    handleError(error.message);
  }
}

function scrapePageData() {
  const pageData = {
    url: window.location.href,
    title: document.title,
    headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
      text: h.innerText,
      level: parseInt(h.tagName.substring(1))
    })),
    links: Array.from(document.querySelectorAll('a[href]')).map(a => ({
      href: a.href,
      text: a.innerText,
      isInternal: a.href.startsWith(window.location.origin)
    })),
    keywords: Array.from(document.querySelectorAll('meta[name="keywords"]')).flatMap(meta => 
      meta.content.split(',').map(kw => kw.trim())
    )
  };
  return pageData;
}

function createGraphData(pageData) {
  const nodes = [];
  const edges = [];
  let nodeId = 0;

  // Add page node
  const pageNodeId = nodeId++;
  nodes.push({id: pageNodeId, label: pageData.title, group: 'Page'});

  // Add headings
  pageData.headings.forEach(heading => {
    const headingNodeId = nodeId++;
    nodes.push({id: headingNodeId, label: heading.text, group: 'Heading'});
    edges.push({from: pageNodeId, to: headingNodeId, label: 'HAS_HEADING'});
  });

  // Add links
  pageData.links.forEach(link => {
    const linkNodeId = nodeId++;
    nodes.push({id: linkNodeId, label: link.text, group: 'Link'});
    edges.push({from: pageNodeId, to: linkNodeId, label: 'HAS_LINK'});
  });

  // Add keywords
  pageData.keywords.forEach(keyword => {
    const keywordNodeId = nodeId++;
    nodes.push({id: keywordNodeId, label: keyword, group: 'Keyword'});
    edges.push({from: pageNodeId, to: keywordNodeId, label: 'HAS_KEYWORD'});
  });

  return {nodes, edges};
}

function displayGraph(graphData) {
  try {
    const container = document.getElementById('graph');
    if (!container) {
      throw new Error('Graph container element not found');
    }

    const data = {
      nodes: new vis.DataSet(graphData.nodes),
      edges: new vis.DataSet(graphData.edges)
    };

    const options = {
      nodes: {
        shape: 'dot',
        size: 16,
        font: {
          size: 14
        }
      },
      edges: {
        arrows: 'to',
        smooth: {
          type: 'cubicBezier',
          forceDirection: 'horizontal',
          roundness: 0.4
        }
      },
      physics: {
        enabled: true,
        barnesHut: {
          gravitationalConstant: -2000,
          centralGravity: 0.3,
          springLength: 95,
          springConstant: 0.04,
          damping: 0.09,
          avoidOverlap: 0.1
        }
      },
      groups: {
        Page: { color: '#FF9900' },
        Heading: { color: '#66CCFF' },
        Link: { color: '#FFCC66' },
        Keyword: { color: '#CCCC33' }
      }
    };

    if (network) {
      network.destroy();
    }
    network = new vis.Network(container, data, options);

    network.once('stabilizationIterationsDone', function() {
      console.log('Graph stabilization finished');
      fitGraph();
    });

  } catch (error) {
    console.error('Error displaying graph:', error);
    handleError(error.message);
  }
}

function handleError(error) {
  console.error('Error:', error);
  const errorMessage = error.message || error.toString();
  document.getElementById('error-message').innerText = 'Error: ' + errorMessage;
  document.getElementById('error-message').style.display = 'block';
}

function zoomGraph(factor) {
  if (network) {
    const scale = network.getScale();
    network.moveTo({ scale: scale * factor });
  }
}

function fitGraph() {
  if (network) {
    network.fit();
  } else {
    console.error("Network is not initialized");
  }
}
