/* icons.jsx — lucide-style stroke icons as React components.
   All share a 24x24 viewBox, stroke=currentColor, 2px. */
(function () {
  const S = ({ children, size = 16, sw = 1.75, style, ...rest }) =>
    React.createElement("svg", {
      width: size, height: size, viewBox: "0 0 24 24", fill: "none",
      stroke: "currentColor", strokeWidth: sw, strokeLinecap: "round",
      strokeLinejoin: "round", style: { flexShrink: 0, ...style }, ...rest
    }, children);

  const P = (...d) => d.map((dd, i) => React.createElement("path", { key: i, d: dd }));
  const mk = (...nodes) => (p) => React.createElement(S, p, nodes.map((n, i) =>
    typeof n === "function" ? n(i) : React.cloneElement(n, { key: i })));

  const path = (d) => (i) => React.createElement("path", { key: i, d });
  const circle = (cx, cy, r) => (i) => React.createElement("circle", { key: i, cx, cy, r });
  const line = (x1, y1, x2, y2) => (i) => React.createElement("line", { key: i, x1, y1, x2, y2 });
  const rect = (x, y, w, h, rx) => (i) => React.createElement("rect", { key: i, x, y, width: w, height: h, rx });
  const poly = (pts) => (i) => React.createElement("polyline", { key: i, points: pts });

  const Icons = {
    GitPullRequest: mk(circle(6, 6, 3), circle(6, 18, 3), path("M6 9v6"), path("M13 6h3a2 2 0 0 1 2 2v7"), poly("16 17 18 19 20 17")),
    Layers: mk(path("M12 2 2 7l10 5 10-5-10-5Z"), path("m2 12 10 5 10-5"), path("m2 17 10 5 10-5")),
    Sparkles: mk(path("M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"), path("M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z")),
    Brain: mk(path("M9.5 4a2.5 2.5 0 0 0-2.5 2.5A2.5 2.5 0 0 0 5 9c0 1 .5 1.8 1.2 2.3A2.5 2.5 0 0 0 5 13.5 2.5 2.5 0 0 0 7.5 16 2.5 2.5 0 0 0 10 18.5V5.5A1.5 1.5 0 0 0 9.5 4Z"), path("M14.5 4a2.5 2.5 0 0 1 2.5 2.5A2.5 2.5 0 0 1 19 9c0 1-.5 1.8-1.2 2.3A2.5 2.5 0 0 1 19 13.5 2.5 2.5 0 0 1 16.5 16 2.5 2.5 0 0 1 14 18.5V5.5A1.5 1.5 0 0 1 14.5 4Z")),
    DollarSign: mk(line(12, 2, 12, 22), path("M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6")),
    History: mk(path("M3 12a9 9 0 1 0 3-6.7L3 8"), path("M3 3v5h5"), path("M12 7v5l3 2")),
    Calendar: mk(rect(3, 4, 18, 18, 2), line(3, 9, 21, 9), line(8, 2, 8, 6), line(16, 2, 16, 6)),
    Settings: mk(circle(12, 12, 3), path("M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z")),
    Search: mk(circle(11, 11, 7), line(21, 21, 16.65, 16.65)),
    Bell: mk(path("M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"), path("M13.7 21a2 2 0 0 1-3.4 0")),
    ChevronRight: mk(poly("9 18 15 12 9 6")),
    ChevronDown: mk(poly("6 9 12 15 18 9")),
    ChevronLeft: mk(poly("15 18 9 12 15 6")),
    ChevronsUpDown: mk(poly("7 15 12 20 17 15"), poly("7 9 12 4 17 9")),
    Plus: mk(line(12, 5, 12, 19), line(5, 12, 19, 12)),
    Check: mk(poly("20 6 9 17 4 12")),
    CheckCircle: mk(path("M22 11.1V12a10 10 0 1 1-5.9-9.1"), poly("22 4 12 14.01 9 11.01")),
    X: mk(line(18, 6, 6, 18), line(6, 6, 18, 18)),
    XCircle: mk(circle(12, 12, 10), line(15, 9, 9, 15), line(9, 9, 15, 15)),
    AlertTriangle: mk(path("M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"), line(12, 9, 12, 13), line(12, 17, 12.01, 17)),
    AlertOctagon: mk(path("M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9L7.9 2Z"), line(12, 8, 12, 12), line(12, 16, 12.01, 16)),
    Info: mk(circle(12, 12, 10), line(12, 16, 12, 12), line(12, 8, 12.01, 8)),
    Lightbulb: mk(path("M9 18h6"), path("M10 22h4"), path("M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z")),
    Shield: mk(path("M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3Z")),
    Zap: mk(poly("13 2 3 14 12 14 11 22 21 10 12 10 13 2")),
    Bug: mk(rect(8, 6, 8, 12, 4), path("M19 7l-3 2"), path("M5 7l3 2"), path("M19 19l-3-2"), path("M5 19l3-2"), path("M21 13h-5"), path("M3 13h5"), path("M12 6V3")),
    FlaskConical: mk(path("M10 2v6.5L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 8.5V2"), line(9, 2, 15, 2), path("M7.5 14h9")),
    File: mk(path("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"), poly("14 2 14 8 20 8")),
    FileText: mk(path("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"), poly("14 2 14 8 20 8"), line(8, 13, 16, 13), line(8, 17, 13, 17)),
    Folder: mk(path("M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-7.5l-2-2.5H4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1Z")),
    Filter: mk(poly("22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3")),
    ArrowRight: mk(line(5, 12, 19, 12), poly("12 5 19 12 12 19")),
    ArrowUp: mk(line(12, 19, 12, 5), poly("5 12 12 5 19 12")),
    ArrowDown: mk(line(12, 5, 12, 19), poly("19 12 12 19 5 12")),
    ExternalLink: mk(path("M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"), poly("15 3 21 3 21 9"), line(10, 14, 21, 3)),
    Eye: mk(path("M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"), circle(12, 12, 3)),
    EyeOff: mk(path("M9.9 4.2A9.5 9.5 0 0 1 12 4c6.5 0 10 7 10 7a13 13 0 0 1-2.2 3"), path("M6.6 6.6A13 13 0 0 0 2 11s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6"), line(2, 2, 22, 22)),
    Copy: mk(rect(9, 9, 13, 13, 2), path("M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1")),
    Play: mk(poly("6 4 20 12 6 20 6 4")),
    RefreshCw: mk(path("M21 12a9 9 0 1 1-3-6.7L21 8"), poly("21 3 21 8 16 8")),
    GitBranch: mk(line(6, 3, 6, 15), circle(18, 6, 3), circle(6, 18, 3), path("M18 9a9 9 0 0 1-9 9")),
    GitCompare: mk(circle(5, 6, 3), circle(19, 18, 3), path("M8 6h7a3 3 0 0 1 3 3v6"), path("M16 18H9a3 3 0 0 1-3-3V9")),
    GitCommit: mk(circle(12, 12, 4), line(2, 12, 8, 12), line(16, 12, 22, 12)),
    GitMerge: mk(circle(18, 18, 3), circle(6, 6, 3), path("M6 9v12"), path("M21 6h-2a8 8 0 0 0-8 8")),
    MessageSquare: mk(path("M21 11.5a8.4 8.4 0 0 1-9 8 9.1 9.1 0 0 1-4-1L3 20l1.5-4.5A8.4 8.4 0 0 1 3 11.5a8.5 8.5 0 0 1 9-8 8.5 8.5 0 0 1 9 8Z")),
    Command: mk(path("M15 6a3 3 0 1 1 3 3h-3V6ZM9 6a3 3 0 1 0-3 3h3V6ZM15 18a3 3 0 1 0 3-3h-3v3ZM9 18a3 3 0 1 1-3-3h3v3Z"), rect(9, 9, 6, 6, 0)),
    Database: mk((i) => React.createElement("ellipse", { key: i, cx: 12, cy: 5, rx: 8, ry: 3 }), path("M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"), path("M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6")),
    Clock: mk(circle(12, 12, 10), poly("12 6 12 12 16 14")),
    Hash: mk(line(4, 9, 20, 9), line(4, 15, 20, 15), line(10, 3, 8, 21), line(16, 3, 14, 21)),
    Tag: mk(path("M20 13.3 13.3 20a2 2 0 0 1-2.8 0L3 12.5V4h8.5L20 12.5a2 2 0 0 1 0 .8Z"), line(7, 7, 7.01, 7)),
    Users: mk(path("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"), circle(9, 7, 4), path("M22 21v-2a4 4 0 0 0-3-3.9"), path("M16 3.1a4 4 0 0 1 0 7.8")),
    User: mk(path("M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"), circle(12, 7, 4)),
    Code: mk(poly("16 18 22 12 16 6"), poly("8 6 2 12 8 18")),
    Cpu: mk(rect(4, 4, 16, 16, 2), rect(9, 9, 6, 6, 0), line(9, 1, 9, 4), line(15, 1, 15, 4), line(9, 20, 9, 23), line(15, 20, 15, 23), line(20, 9, 23, 9), line(20, 14, 23, 14), line(1, 9, 4, 9), line(1, 14, 4, 14)),
    Gauge: mk(path("M12 14 16 9"), circle(12, 14, 1.5), path("M4.5 18a9 9 0 1 1 15 0")),
    Target: mk(circle(12, 12, 9), circle(12, 12, 5), circle(12, 12, 1)),
    Boxes: mk(path("M3 8l4-2 4 2v4l-4 2-4-2V8Z"), path("M13 8l4-2 4 2v4l-4 2-4-2V8Z"), path("M8 16l4-2 4 2v4l-4 2-4-2v-4Z")),
    Link: mk(path("M9 15l6-6"), path("M11 6l1-1a3.5 3.5 0 0 1 5 5l-1 1"), path("M13 18l-1 1a3.5 3.5 0 0 1-5-5l1-1")),
    Lock: mk(rect(4, 11, 16, 10, 2), path("M8 11V7a4 4 0 0 1 8 0v4")),
    Trash: mk(poly("3 6 5 6 21 6"), path("M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"), line(10, 11, 10, 17), line(14, 11, 14, 17)),
    Edit: mk(path("M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"), path("M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z")),
    Slash: mk(line(5, 19, 19, 5)),
    Dot: mk(circle(12, 12, 3)),
    Moon: mk(path("M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z")),
    Sun: mk(circle(12, 12, 4), line(12, 2, 12, 4), line(12, 20, 12, 22), line(4.2, 4.2, 5.6, 5.6), line(18.4, 18.4, 19.8, 19.8), line(2, 12, 4, 12), line(20, 12, 22, 12), line(4.2, 19.8, 5.6, 18.4), line(18.4, 5.6, 19.8, 4.2)),
    Menu: mk(line(3, 6, 21, 6), line(3, 12, 21, 12), line(3, 18, 21, 18)),
    Star: mk(poly("12 2 15.1 8.6 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.6 12 2")),
    Upload: mk(path("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"), poly("17 8 12 3 7 8"), line(12, 3, 12, 15)),
    Globe: mk(circle(12, 12, 10), line(2, 12, 22, 12), path("M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z")),
    Wrench: mk(path("M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.5 2.5-2.1-.4-.4-2.1 2.5-2.5Z")),
    ListChecks: mk(path("M3 5l1.5 1.5L7 4"), path("M3 12l1.5 1.5L7 10"), path("M3 19l1.5 1.5L7 17"), line(11, 5, 21, 5), line(11, 12, 21, 12), line(11, 19, 21, 19)),
    Activity: mk(poly("22 12 18 12 15 21 9 3 6 12 2 12")),
    BarChart: mk(line(12, 20, 12, 10), line(18, 20, 18, 4), line(6, 20, 6, 16), line(3, 20, 21, 20)),
    TrendingUp: mk(poly("22 7 13.5 15.5 8.5 10.5 2 17"), poly("16 7 22 7 22 13")),
    TrendingDown: mk(poly("22 17 13.5 8.5 8.5 13.5 2 7"), poly("16 17 22 17 22 11")),
    Workflow: mk(rect(3, 3, 7, 7, 1), rect(14, 14, 7, 7, 1), path("M10 6.5h4a2 2 0 0 1 2 2V14"), path("M6.5 10v4a2 2 0 0 0 2 2h2")),
    PanelRight: mk(rect(3, 3, 18, 18, 2), line(15, 3, 15, 21)),
    CornerDownRight: mk(poly("15 10 20 15 15 20"), path("M4 4v7a4 4 0 0 0 4 4h12")),
  };

  window.Icon = Icons;
})();
