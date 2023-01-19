// import * as d3 from 'd3';

export default class ChartClass {
  static objId = 0;

  options = {
    groupsTopOffset: 14,
    linesRegression: null,
    xAxis: {
      type: 'time', // linear, time, log, point, band
      timeFormat: null, // %Y-%m-%d %H:%M:%S
      textRotate: -45, // 45, -45, 90, -90
      textTranslate: [-10, 0],
      textAnchor: 'end', // start, end
      barplotType: 'divided', // overlay, divided, accumulation
      barplotBarWidthEnabled: false,
      barplotBarWidth: 80, // percent
      verticalLines: true,
      xSelection: true,
      hideXAxis: false,
    },
    hideYAxis: false,
    curves:{}
  }

  box = {
    width: null,
    height: null,
  }

  svgContainer = null // ref to svg container

  svgGroups = null

  groupNumberList = []

  groupCount = 1 // number of chart groups

  metrics = []

  data = []

  svg = null // svg element

  xAxis = null // group X axis element

  maxYLeftAxisWidth = 30

  maxYRightAxisWidth = 5

  xAxisHeight = 30

  barplotWidth = 30

  y = {}

  brushes = [];

  yMinMax = [];

  xMinMax = [];

  theme = null;

  constructor(svgContainer, width, height, theme, options, linesRegression) {
    this.id = ChartClass.objId += 1;
    this.theme = theme;
    this.options = ChartClass.mergeDeep(this.options, options);
    this.options.linesRegression = linesRegression;
    this.svgContainer = svgContainer;
    this.box = { width, height };
    this.updateBox(width, height);
    this.createTooltip();
    this.createSvgElement();
    this.render();
  }

  updateBox(width, height) {
    this.box = { width, height };
    this.render();
  }

  render() {
    d3.select(this.svgContainer)
      .selectAll('svg')
      .nodes()
      .forEach((item) => item.remove());
    this.createSvgElement();
    this.createXAxis();
    this.createGroups();
  }

  createSvgElement() {
    const { width, height } = this.box;
    this.svg = d3.select(this.svgContainer)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

  }

  createTooltip() {
    this.tooltip = d3.select(this.svgContainer)
      .append('div')
      .style('position', 'absolute')
      .style('background-color', 'var(--background_secondary)')
      .style('border', '1px solid var(--border)')
      .style('border-radius', '4px')
      .style('color', 'var(--text_main)')
      .style('padding', '5px')
      .style('font-size', '12px')
      .style('white-space', 'nowrap')
      .style('z-index', '2')
      .style('pointer-events', 'none')
      .style('text-align', 'left')
      .style('visibility', 'hidden');
  }

  createXAxis() {
    const { height } = this.box;
    const {
      type,
      nice,
      ticksEnabled,
      ticks,
      label,
    } = this.options.xAxis;
    const { options, maxYLeftAxisWidth } = this;
    const barWidth = this.bandX?.bandwidth() || 30;
    const scaleFuncName = ChartClass
      .capitalizeFirstLetter(type, 'scale?');
    const xMin = d3.min(this.data.map((item) => item[this.xMetric]));
    const xMax = d3.max(this.data.map((item) => item[this.xMetric]));
    let offset = 0;
    if (this.hasBarplot) {
      offset = ((xMax - xMin) / this.data.length) / 1.8;
    }
    this.xMinMax = [
      xMin - offset,
      xMax + offset,
    ];

    // eslint-disable-next-line no-multi-assign
    const xFun = this.x = d3[scaleFuncName]()
      .domain(this.xMinMax)
      .range([0, this.chartWidth]);

    if (xFun.nice && nice !== undefined) {
      xFun.nice(nice);
    } else {
      const rangeOffset = (barWidth / 2) * 1.5;
      if (rangeOffset) {
        xFun.range([rangeOffset, this.chartWidth - rangeOffset]);
      }
    }

    if (this.xAxis && this.xAxis.size()) {
      this.xAxis.remove();
    }

    if (this.data.length === 0) {
      return;
    }

    if (!this.options.xAxis.hideXAxis) {
      this.xAxis = this.svg
      .append('g')
      .attr('transform', `translate(${maxYLeftAxisWidth},${height - this.xAxisHeight})`)
      .attr('class', 'xAxis')
      .style('color', this.theme.text_main)
      .call(
        d3.axisBottom(this.x)
        .tickFormat(this.xTickFormat.bind(this))
        .ticks(ticksEnabled ? ticks : null),
      );

      const rotate = options.xAxis.textRotate ? ` rotate(${options.xAxis.textRotate})` : '';

      // rotate x axis text
      this.xAxis.selectAll('text')
      .attr('transform', `translate(${options.xAxis.textTranslate}) ${rotate}`) //
      .style('text-anchor', options.xAxis.textAnchor);

      if (label) {
        // Add X axis label:
        this.xAxis.append('text')
        .attr('x', (this.box.width / 2) - this.maxYLeftAxisWidth)
        .attr('y', 30)
        .attr('font-size', '12')
        .attr('fill', 'var(--main_text)')
        .attr('text-anchor', 'middle')
        .text(label);
      }

      // recalculate x axis height
      const xAxisBBox = this.xAxis.node().getBBox();
      this.xAxisHeight = xAxisBBox.height;
      this.xAxis.attr('transform', `translate(${maxYLeftAxisWidth},${height - this.xAxisHeight})`);
    }
  }

  createGroups() {
    if (this.svgGroups && this.svgGroups.size()) {
      this.svgGroups.remove();
    }
    const { groupCount } = this;
    const { width, height } = this.box;
    const groupHeight = (height - this.xAxisHeight) / groupCount;

    this.svgGroups = this.svg
      .append('g')
      .attr('class', 'groups');

    this.groups.forEach((num, i) => {
      this.createGroupYAxes(width, groupHeight, groupHeight * i, num);
    });

    // running after create Y axes
    this.brushes = [];
    this.groups.forEach((num, i) => {
      this.createGroupCharts(width, groupHeight, groupHeight * i, num);
    });
  }

  createGroupYAxes(width, height, y, num) {
    const {
      groupsTopOffset,
      yGroupLabel,
    } = this.options;
    const { barplotType } = this.options.xAxis;
    const groupHeight = height - groupsTopOffset;
    const metrics = this.metrics
      .filter((metric) => metric.name !== this.xMetric)
      .filter((item) => item.group === num);

      const group = this.svgGroups
      .append('g')
      .attr('number', num)
      .attr('y', y)
      .attr('transform', `translate(0,${y + groupsTopOffset})`)
      .attr('class', `group-${num} group`);

      // create left and right Y axis group
      const yGroups = {
        Left: group
        .append('g')
        .attr('class', `group-${num}-yLeft yLeft`)
        .attr('transform', `translate(${this.maxYLeftAxisWidth},0)`),
        Right: group
        .append('g')
        .attr('class', `group-${num}-yRight yRight`)
        .attr('transform', `translate(${width - this.maxYRightAxisWidth},0)`),
      };

      /// create Y axes for barplot
      const xOffset = {Right: 0, Left: 0};
      const axisPosition = 'Left';
      const yGroupItem = yGroups[axisPosition].append('g');
      let minYBarMetric = 0;
      let maxYBarMetric = 0;
      const barplotMetrics = metrics.filter((metric) => metric.type === 'barplot');


      if (barplotType === 'accumulation') {
        this.data.forEach((item) => {
          let up = 0;
          let down = 0;
          barplotMetrics.forEach((metric) => {
            const val = item[metric.name];
            if (val >= 0) {
              up += val;
            } else {
              down += val;
            }
          });
          if (up > maxYBarMetric) maxYBarMetric = up;
          if (down < minYBarMetric) minYBarMetric = down;
        });
      } else {
        barplotMetrics.forEach((metric) => {
          const min = d3.min(this.data, (d) => d[metric.name]);
          if (min < minYBarMetric) minYBarMetric = min;
          const max = d3.max(this.data, (d) => d[metric.name]);
          if (max > maxYBarMetric) maxYBarMetric = max;
        });
      }
      let className = '';
      barplotMetrics.forEach((metric) => {
        this.yMinMax[metric.name] = [minYBarMetric, maxYBarMetric];
        this.y[metric.name] = d3.scaleLinear()
        .domain([minYBarMetric, maxYBarMetric])
        .range([groupHeight, 0])
        .nice(metric.nice);
        yGroupItem
        .call(
          d3[`axis${axisPosition}`](this.y[metric.name])
          .ticks(metric.ticks || Math.ceil(groupHeight / 30)),
        );
        className += ` axis-y-${metric.n}`;
      });
      yGroupItem.attr('class', `y${axisPosition}Axis axis-y ${className}`);
      xOffset[axisPosition] += yGroupItem.node().getBBox().width;

      /// create Y axes
      const linearMetrics = metrics.filter((metric) => (
        ['line', 'scatter'].includes(metric.type)
      ));
      linearMetrics.forEach((metric) => {
        const axisSide = metric.yAxisSide === 'right' ? 'Right' : 'Left';

        const extendMetrics = linearMetrics.filter(({yAxisLink}) => yAxisLink === metric.name);

        let min = d3.min(this.data, (d) => d[metric.name]);
        // TODO: разобраться с офсетом
        // let max = d3.max(this.data, (d) => d[metric.name]+50);
        let max = d3.max(this.data, (d) => d[metric.name]);
        let addClassName = '';

        extendMetrics.forEach((item) => {
          const minExt = d3.min(this.data, (d) => d[item.name]);
          const maxExt = d3.max(this.data, (d) => d[item.name]);
          if (minExt < min) min = minExt;
          if (maxExt > max) max = maxExt;
          addClassName += ` axis-y-${item.n}`;
        });

        const minYMetric = ChartClass.canBeNumber(metric.lowerBound) && +metric.lowerBound < min
          ? +metric.lowerBound
          : min;

        const maxYMetric = ChartClass.canBeNumber(metric.upperBound) && metric.upperBound > max
          ? +metric.upperBound
          : max;

        this.yMinMax[metric.name] = [minYMetric, maxYMetric];
        this.y[metric.name] = d3.scaleLinear()
        .domain([minYMetric, maxYMetric])
        .range([groupHeight, 0])
        .nice(metric.nice);

        if (metric.yAxisLink) {
          return;
        }
        if (this.options.hideYAxis) {
          return;
        }
        const offset = (
          axisSide === 'Right'
        )
          ? xOffset[axisSide]
          : -xOffset[axisSide];
        const yGroup = yGroups[axisSide]
        .append('g')
        .attr('class', `y${axisSide}Axis axis-y axis-y-${metric.n} ${addClassName}`)
        .attr('transform', `translate(${offset},0)`)
        .style('color', this.theme.text_main)
        .call(
          d3[`axis${axisSide}`](this.y[metric.name])
          .tickFormat((str) => (
            metric.unit ? `${str} ${metric.unit}` : str
          ))
          .ticks(metric.ticks || Math.ceil(groupHeight / 30)),
        );

        if (metric.coloredYAxis) {
          yGroup.selectAll('text').attr('fill', metric.color);
        }
        xOffset[axisSide] += yGroup.node().getBBox().width + 8;

      });
    if (!this.options.hideYAxis) {
      if (yGroupLabel) {
        // Add Y axis label:
        yGroups.Left.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', groupHeight / -2)
        .attr('y', -20)
        .attr('font-size', '12')
        .attr('fill', 'var(--main_text)')
        .attr('text-anchor', 'middle')
        .text(yGroupLabel);
      }


    }
      // recalculate y axis width
      const yLeftAxisBBox = yGroups.Left.node().getBBox();
      this.updateMaxYLeftAxisWidth(Math.ceil(
        !this.options.hideYAxis
          ? yLeftAxisBBox.width : 0));

      // recalculate y axis width
      const yRightAxisBBox = yGroups.Right.node().getBBox();
      this.updateMaxYRightAxisWidth(Math.ceil(
        !this.options.hideYAxis
          ? yRightAxisBBox.width : 0));
    this.createXAxis();
  }

  createGroupCharts(width, height, y, num) {
    const { groupsTopOffset } = this.options;
    const {
      barplotType,
      barplotBarWidthEnabled,
      barplotBarWidth,
      verticalLines,
      xSelection,
    } = this.options.xAxis;
    const groupHeight = height - groupsTopOffset;
    const groupMetrics = this.metrics
      // hide metric that use x-axis
      .filter((metric) => metric.name !== this.xMetric)
      .filter((metric) => metric.group === num);

    /// create chart container
    const chartGroup = this.svgGroups
      .select(`g.group-${num}`)
      .append('g')
      .attr('transform', `translate(${this.maxYLeftAxisWidth},0)`)
      .attr('class', `group-${num}-chart group-chart`);

    // add clipPath
    chartGroup.append('clipPath')
      .attr('id', `group-rect-${num}-${this.id}`)
      .append('rect')
      .attr('height', height - groupsTopOffset)
      .attr('width', this.box.width - this.maxYLeftAxisWidth - this.maxYRightAxisWidth);

    if (verticalLines) {
      this.addXTickLines(chartGroup, groupHeight);
    }
    if (xSelection) {
      // this.addBrush(chartGroup, groupHeight);
    } else {
      this.addCrossSelection(chartGroup, groupHeight);
    }

    // add barplots
    const groupBarplotMetrics = groupMetrics.filter((metric) => metric.type === 'barplot');
    const subgroups = groupBarplotMetrics.map((d) => d.name);
    const groups = d3.map(this.data, (d) => d[this.xMetric]).keys();

    // add band X for barplot width
    this.bandX = d3.scaleBand()
      .domain(groups)
      .range([0, this.chartWidth])
      .padding([barplotBarWidthEnabled ? (1 - barplotBarWidth / 100) : 0.2]);

    if (groupBarplotMetrics.length) {
      if (barplotType === 'divided') {
        this.addDividedBarplots(num, groups, subgroups, groupHeight);
      } else {
        groupBarplotMetrics.reverse();
        try {
          this.addBarplots(num, groups, groupBarplotMetrics, groupHeight);
        } catch (err) {
          console.warn(err);
          this.renderGroupError(num, err.message);
        }
      }
      groupBarplotMetrics.forEach((metric) => {
        this.addZeroLine(chartGroup, metric);
      });
      const firstBarplot = this.svgGroups.select('.barplot-divided.metric').node();
      if (firstBarplot) {
        this.barplotWidth = firstBarplot.width.baseVal.value;
      }
    }

    // resizes x axis
    this.createXAxis();

    // add lines charts
    groupMetrics
      .filter((metric) => metric.type === 'line')
      .reverse()
      .forEach((metric) => {
        this.addZeroLine(chartGroup, metric);
        this.addPath(chartGroup, metric, height, num);
      });

    // resizes x axis
    this.createXAxis();

    // add lines charts
    groupMetrics
      .filter((metric) => metric.type === 'scatter')
      .reverse()
      .forEach((metric) => {
        this.addScatterDots(chartGroup, metric, height, num);
        this.addScatterLine(chartGroup, metric);
      });

    this.addCrossSelection(chartGroup, groupHeight);
  }

  /**
   * event on chart zoom
   * @param cb
   */
  onZoom(cb) {
    this.onZoomCb = cb;
  }

  /**
   * event on chart click
   * @param cb
   */
  onClick(cb) {
    this.onClickCb = cb;
  }

  zoomChart() {
    // this.tooltipHide = false;
    const { selection } = d3.event;
    if (selection && this.x) {
      const { invert } = this.x;
      const range = selection.map((point) => {
        let result = invert ? invert(point) : point;
        if (result instanceof Date) {
          result = result.getTime();
        }
        return result;
      });
      if (this.onZoomCb) {
        this.onZoomCb(range);
      }
      this.brushes.forEach((brush) => {
        this.svg.selectAll('.brush').call(brush.move, null);
      });
    }
    this.hideTooltip();
  }

  /**
   * @param metricsByGroup = [
   * [ // groups
   *    [ // metrics
   *      {
   *        name: 'Metric name',
   *        yAxisSide: 'right',
   *        color: 'red',
   *        ticks: 10',
   *        type: 'line', // barplot, scatter
   *        lastDot: 0, // 0 - last, 1 - every, 'odd', 'even', 3, ...
   *        zerosAfterDot: 2, // 1, 2, 3, ...
   *        strokeDasharray: '0', // '5,5', '1,3', '1, 3, 6, 3'
   *        strokeWidth: 1,
   *        dotSize: 4,
   *        showPeakDots: false,
   *      },
   *      ...
   *    ]
   * ],
   * ...]
   * @param xAxisSettings = {
   *   type: 'time', // linear, time
   *   timeFormat: null, // %Y-%m-%d %H:%M:%S
   *   textRotate: -45, // 45, -45, 90, -90
   *   barplotType: 'divided', // overlay, divided, accumulation
   *   barplotBarWidthEnabled: false,
   *   barplotBarWidth: 80, // percent
   * }
   * @param data
   * @param xMetric
   * @param linesRegression
   */
  update(
    metricsByGroup,
    xAxisSettings,
    data,
    curves,
    hideYAxis,
    xMetric = '_time',
    linesRegression = null,
  ) {
    this.resetTmpData();
    const color = d3.scaleOrdinal().range(d3.schemeSet2);
    this.xMetric = xMetric;
    this.options.xAxis = {
      ...this.options.xAxis,
      ...xAxisSettings,
    };
    this.options.linesRegression = linesRegression;
    this.options.curves = curves;
    this.options.hideYAxis = hideYAxis;

    // recalc options
    if (this.options.xAxis.textRotate !== undefined) {
      switch (this.options.xAxis.textRotate) {
        case 0:
          this.options.xAxis.textTranslate = [0, 0];
          this.options.xAxis.textAnchor = 'center';
          break;
        case 45:
          this.options.xAxis.textTranslate = [10, 0];
          this.options.xAxis.textAnchor = 'start';
          break;
        case 90:
          this.options.xAxis.textTranslate = [12, 8];
          this.options.xAxis.textAnchor = 'start';
          break;
        case -90:
          this.options.xAxis.textTranslate = [-12, 10];
          this.options.xAxis.textAnchor = 'end';
          break;
        case -45:
        default:
          this.options.xAxis.textTranslate = [-10, 0];
          this.options.xAxis.textAnchor = 'end';
          break;
      }
    }

    const metrics = ChartClass.metricsToMetricsByGroup(metricsByGroup);
    this.hasBarplot = metrics.findIndex((m) => m.type === 'barplot') !== -1;
    this.metrics = metrics.map((item, n) => ({
      coloredYAxis: true,
      ...item,
      n,
      type: item.type || 'line',
      color: (item.color || color(item.name)),
    }));
    this.data = data;
    this.groups = Object.keys(metricsByGroup).map((num) => +num);

    // update x axis
    this.createXAxis();
    this.createGroups();
  }

  resetTmpData() {
    this.xAxisHeight = 30;
    this.maxYRightAxisWidth = 30;
    this.maxYLeftAxisWidth = 5;
    this.metrics = null;
    this.data = null;
    this.brushes = [];
  }

  set groups(val) {
    this.groupNumberList = val.sort();
    this.groupCount = val.length;
  }

  get groups() {
    return this.groupNumberList;
  }

  get chartWidth() {
    const {
      box,
      maxYLeftAxisWidth,
      maxYRightAxisWidth,
    } = this;
    return box.width - maxYLeftAxisWidth - maxYRightAxisWidth;
  }

  set linesRegression(val) {
    this.options.linesRegression = val;
  }

  get linesRegression() {
    return this.options.linesRegression;
  }

  get theme() {
    return this.theme;
  }

  set theme(val) {
    this.theme = val;
  }

  updateMaxYRightAxisWidth(width) {
    if (this.maxYRightAxisWidth < width) {
      this.maxYRightAxisWidth = width;
      this.updateYRightSizes();
    }
  }

  updateYRightSizes() {
    this.svg.selectAll('g.yRight')
      .attr('transform', `translate(${this.box.width - this.maxYRightAxisWidth},0)`);
  }

  updateMaxYLeftAxisWidth(width) {
    if (this.maxYLeftAxisWidth < width) {
      this.maxYLeftAxisWidth = width;
      this.updateYLeftSizes();
    }
  }

  updateYLeftSizes() {
    this.svg.selectAll('g.yLeft')
      .attr('transform', `translate(${this.maxYLeftAxisWidth},0)`);
  }

  moveInNewContainer(container) {
    this.svgContainer = container;
    this.svg = d3.select(container)
      .append(() => this.svg.remove().node());
    if (this.tooltip) {
      this.tooltip.remove();
    }
    this.createTooltip();
  }

  highlightMetric(metric) {
    if (metric) {
      const item = this.metrics.find((d) => d.name === metric.name);
      if (!item) {
        return;
      }
      this.svgGroups.selectAll('.metric, .axis-y, .metric-red-lines').attr('opacity', 0.3);
      this.svgGroups
        .selectAll(`.metric-${item.n}, .axis-y-${item.n}, .metric-${item.n}-red-lines`)
        .attr('opacity', 1);
    } else {
      this.svgGroups.selectAll('.metric, .axis-y, .metric-red-lines').attr('opacity', null);
    }
  }

  highlightMetricDot(metric, isActive) {
    if (metric && !isActive) {
      this.svgGroups.selectAll('.dot, .axis-y').attr('opacity', 0.3);
      this.svgGroups.selectAll('.dot, .axis-y').attr('display', 'block');
      this.svgGroups.selectAll(`.dot-${metric.name}, .axis-y-${metric.name}`).attr('opacity', 1);
    } else if (metric && isActive) {
      this.svgGroups.selectAll('.dot, .axis-y').attr('display', 'none');
      this.svgGroups.selectAll(`.dot-${metric.name}, .axis-y-${metric.name}`).attr('display', 'block');
    } else {
      this.svgGroups.selectAll('.dot, .axis-y').attr('opacity', null);
    }
  }

  xTickFormat(d) {
    const { xAxis } = this.options;
    const { timeFormat, stringOX } = xAxis;
    let val = d;
    if ((xAxis.type === 'time') && !stringOX) {
      if (ChartClass.isTimestamp(d)) {
        val *= 1000;
      }
      return d3.timeFormat(timeFormat || '%Y-%m-%d %H:%M:%S')(val);
    }
    return d;
  }

  showTooltip() {
    if (this.tooltip) {
      this.tooltip.style('visibility', 'visible');
    }
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style('visibility', 'hidden');
    }
  }

  updateTooltip(d, metric, left, top, curMetricBold = true) {
    this.tooltip
      .html(
        [
          ...this.metrics,
        ]
          .reduce((prev, cur) => {
            let value = d[cur.name];
            if (cur.name === this.xMetric) {
              value = this.xTickFormat(value);
            }
            const fontWeight = (curMetricBold && metric.name === cur.name) ? 'bold' : 'regular';
            const title = cur.title || cur.name;
            return cur.showText ?
              `${prev}<div style="font-weight: ${fontWeight}">${title}: <span>${value}</span></div>`
              : prev;
          }, ''),
      );

    let leftPos = left;
    if (left > this.box.width / 2) {
      leftPos -= this.tooltip.node().offsetWidth + 20;
    }

    let topPos = top;
    if (top > this.box.height / 2) {
      topPos -= this.tooltip.node().offsetHeight + 20;
    }

    this.tooltip
      .style('visibility', null)
      .style('left', `${leftPos + 10}px`)
      .style('top', `${topPos + 10}px`);
  }

  addXTickLines(chartGroup, groupHeight) {
    chartGroup
      .append('g')
      .attr('class', 'vertical-tick-lines')
      .style('color', this.theme.text_main)
      .attr('transform', `translate(0,${groupHeight})`)
      .call(d3.axisBottom(this.x)
        .tickSize(-groupHeight)
        .tickFormat((_) => '')
        .ticks(10))
      .selectAll('.tick line')
      .attr('opacity', 0.2);
    chartGroup
      .selectAll('g.vertical-tick-lines .domain')
      .attr('stroke', '#8888');
  }

  addBrush(chartGroup, groupHeight) {
    const { groupsTopOffset } = this.options;
    const brush = d3.brushX()
      .extent([
        [0, -groupsTopOffset],
        [this.chartWidth, groupHeight],
      ])
      // .on('start', this.hideTooltip.bind(this))
      // .on('end', this.zoomChart.bind(this));
    chartGroup
      .append('g')
      .attr('class', 'brush')
      .call(brush);
    this.brushes.push(brush);
    chartGroup.select('.selection').attr('stroke', null);

    // vertical selector line-dot
    this.addCrossSelection(chartGroup, groupHeight);
  }

  addCrossSelection(chartGroup, groupHeight) {
    const { width } = this.box;
    const { groupsTopOffset } = this.options;
    chartGroup
      .append('line')
      .attr('class', 'line-dot')
      .attr('x1', 0)
      .attr('y1', -groupsTopOffset)
      .attr('x2', 0)
      .attr('y2', groupHeight)
      .attr('opacity', 0)
      .attr('stroke', '#888')
      .attr('stroke-dasharray', '3 3');

    chartGroup
      .append('line')
      .attr('class', 'line-dot-h')
      .attr('x1', -this.maxYLeftAxisWidth)
      .attr('y1', 0)
      .attr('x2', width)
      .attr('y2', 0)
      .attr('opacity', 0)
      .attr('stroke', '#888')
      .attr('stroke-dasharray', '3 3');
  }

  renderPeakDots(chartGroup, metric, groupHeight, groupNum, line) {
    const { groupsTopOffset } = this.options;
    chartGroup
      .append('g')
      .attr('class', `metric metric-${metric.n}`)
      .selectAll('dot')
      .data(line)
      .enter()
      .append('circle')
      .attr('class', (d, i, nodes) => {
        let className = 'dot';
        if (nodes.length === 1) {
          className += ' dot-show';
        } else if (metric.showPeakDots) {
          className += ' dot-show';
        }
        return className;
      })
      .style('opacity', (d, i, elems) => +elems[i].classList.contains('dot-show'))
      .attr('cx', (d) => this.x(d[this.xMetric]))
      .attr('cy', (d) => this.y[metric.yAxisLink || metric.name](d[metric.name]))
      .attr('r', metric.dotSize)
      .attr('fill', metric.color)
      .on('click', (d) => this.clickChart([d[this.xMetric], d[metric.name]]))
      .on('mouseover', (d, i, elems) => {


        const lineXPos = this.x(i[this.xMetric]);
        const lineYPos = this.y[metric.yAxisLink || metric.name](i[metric.name]);
        this.setLineDotPosition(lineXPos, lineYPos, groupNum);
        const tooltipLeftPos = lineXPos + this.maxYLeftAxisWidth;
        const tooltipTopPos = lineYPos + (groupHeight * groupNum) + groupsTopOffset;
        this.updateTooltip(i, metric, tooltipLeftPos, tooltipTopPos);
      })
      .on('mouseout', (d, i, elems) => {
        // const dotShow = elems[i].classList.contains('dot-show');
        // d3.select(elems[i]).style('opacity', +dotShow);
        this.hideLineDot();
        this.hideTooltip();
      });
  }

  renderRedLines(chartGroup, metric, groupHeight, line) {
    const { groupsTopOffset } = this.options;
    chartGroup
      .append('g')
      .attr('class', `metric-red-lines metric-${metric.n}-red-lines`)
      .selectAll('line')
      .data(line)
      .enter()
      .filter((d) => !!d[`_${[metric.name]}_mark`])
      .append('line')
      .attr('x1', (d) => this.x(d[this.xMetric]))
      .attr('x2', (d) => this.x(d[this.xMetric]))
      .attr('y1', 0)
      .attr('y2', groupHeight - groupsTopOffset)
      .attr('stroke', 'red');
  }

  renderPeakTexts(chartGroup, metric, line) {
    const data = line.filter((d, i) => {
      if (metric.lastDot === '0' && line.length === i + 1) {
        return true;
      }
      return ChartClass.lastDotParamForPoint(metric.lastDot, i, line);
    });

    chartGroup
      .append('g')
      .attr('class', `metric metric-${metric.n}`)
      .selectAll('dot')
      .data(data)
      .enter()
      .append('text')
      .attr('transform', (d, i) => {
        let translate = 0;
        if (metric.type === 'line') {
          translate = (i === 0) ? 5 : -5;
        }
        return `translate(${translate}, -5)`;
      })
      .attr('font-size', '11')
      .attr('pointer-events', 'none')
      .attr('text-anchor', 'start') // middle
      .attr('fill', 'var(--main_text)')
      .attr('class', `metric metric-${metric.n}`)
      .text((d) => ChartClass.valueToText(metric, d))
      .attr('x', (d) => {
        let xPos = this.x(d[this.xMetric]);
        if (metric.type === 'barplot' && this.options.xAxis.barplotType === 'divided') {
          xPos += metric.n * this.barplotWidth * 1.1;
        }
        return xPos;
      })
      .attr('y', (d) => {
        let yPos = this.y[metric.yAxisLink || metric.name](d[metric.name]);
        if (metric.type === 'barplot' && d[metric.name] < 0) {
          yPos += 15;
        }
        return yPos - 1;
      });
  }

  addZeroLine(chartGroup, metric) {
    const yName = metric.yAxisLink || metric.name;
    const zeroHeight = this.y[yName](0);
    const minHeight = this.y[yName](this.yMinMax[metric.name][0]);
    const maxHeight = this.y[yName](this.yMinMax[metric.name][1]);
    const strokeWidth = 0.5;
    if (zeroHeight < minHeight && zeroHeight > maxHeight) {
      chartGroup
        .append('line')
        .attr('class', 'metric-zero-line')
        .attr('x1', 0)
        .attr('y1', zeroHeight + strokeWidth)
        .attr('x2', this.chartWidth)
        .attr('y2', zeroHeight + strokeWidth)
        .attr('stroke-width', strokeWidth)
        .style('stroke-dasharray', '3,3')
        .attr('stroke', '#999')
        .style('pointer-events', 'none');
    }
  }

  addPath(chartGroup, metric, height, num) {
    // разбиваем линию на отрезки по пустым ячейкам
    const {
      showArea,
      color,
      yAxisLink,
      name,
    } = metric;
    let line = [];
    this.data
      .reduce((prev, cur, currentIndex, arr) => {
        if (cur[name] === null) {
          prev.push(line);
          line = [];
        } else {
          line.push(cur);
        }
        if (currentIndex === arr.length - 1) {
          prev.push(line);
        }
        return prev;
      }, [])
      // eslint-disable-next-line no-shadow
      .forEach((line) => {
        if (line.length === 0) {
          return;
        }

        // add the line itself
        const path = chartGroup
          .append('path')
          .attr('clip-path', `url(#group-rect-${num}-${this.id})`)
          .attr('class', `metric metric-${metric.n}`)
          .datum(line)
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', metric.strokeWidth)
          .style('stroke-dasharray', metric.strokeDasharray);

        // add red lines
        this.renderRedLines(chartGroup, metric, height, line);

        if (showArea) {
          path
            .attr('fill', d3.hsl(color).brighter(0.1))
            .attr('d', d3.area()
              .x((d) => this.x(d[this.xMetric]))
              .y0((d) => this.y[yAxisLink || name](d[name]))
              .y1(() => this.y[yAxisLink || name](0)));
        } else {
          path
            .attr('d', this.setCurve(
              d3.line()
                .x((d) => this.x(d[this.xMetric]))
                .y((d) => this.y[yAxisLink || name](d[name])),
              this.options.curves && this.options.curves[name]
            ));


        }

        // add dots
        this.renderPeakDots(chartGroup, metric, height, num, line);

        // add text
        if (metric.showText) {
          this.renderPeakTexts(chartGroup, metric, line);
        }
      });
  }
  setCurve(line, curve) {

    // TODO: под прямым углом
    // return isCurve ? line.curve(d3.curveStep) : line
    // return isCurve ? line.curve(d3.curveStepBefore) : line
    // return isCurve ? line.curve(d3.curveStepAfter) : line

    // TODO: скругление
    // return isCurve ? line.curve(d3.curveNatural) : line

    // TODO: скругление с отризанием крайних
    // return isCurve ? line.curve(d3.curveCardinalOpen) : line




    return curve ? line.curve(d3[curve]) : line
    // return line
  }

  addScatterDots(chartGroup, metric, height, num) {
    const color = d3.scaleOrdinal().range(d3.schemeSet2);
    chartGroup.append('g')
      .selectAll('dot')
      .data(this.data)
      .enter()
      .append('circle')
      .attr('class', (d) => `dot dot-${d[metric.metricGroup]}`)
      .attr('cx', (d) => this.x(d[this.xMetric]))
      .attr('cy', (d) => this.y[metric.yAxisLink || metric.name](d[metric.name]))
      .attr('r', metric.dotSize || 3)
      .style('fill', (d) => color(d[metric.metricGroup]))
      .on('mouseover', (d) => {
        const lineXPos = this.x(d[this.xMetric]);
        const lineYPos = this.y[metric.yAxisLink || metric.name](d[metric.name]);
        this.setLineDotPosition(lineXPos, lineYPos, num);
        const tooltipLeftPos = lineXPos + this.maxYLeftAxisWidth;
        const tooltipTopPos = lineYPos + (height * num) + 14;
        this.updateTooltip(d, metric, tooltipLeftPos, tooltipTopPos, false);
      })
      .on('mouseout', () => {
        this.hideLineDot();
        this.hideTooltip();
      })
      .on('click', (d) => {
        this.clickChart(d);
      });
  }

  addScatterLine(chartGroup, metric) {
    const color = d3.scaleOrdinal().range(d3.schemeSet2);
    const coordinates = this.data.reduce((acc, item) => {
      if (!acc[item.group_numb]) {
        acc[item.group_numb] = [];
      }
      acc[item.group_numb].push(item);
      return acc;
    }, {});
    const drawingLinesRegression = this.options.linesRegression.map((item) => coordinates[item]);
    chartGroup.append('g')
      .selectAll('line')
      .data(drawingLinesRegression)
      .enter()
      .append('line')
      .attr('class', 'line')
      .attr('x1', (d) => this.x(d[0][this.xMetric]))
      .attr('x2', (d) => this.x(d[d.length - 1][this.xMetric]))
      .attr('y1', (d) => this.y[metric.yAxisLink || metric.name](d[0].y_reg))
      .attr('y2', (d) => this.y[metric.yAxisLink || metric.name](d[d.length - 1].y_reg))
      .style('stroke', (d) => color(d[0][metric.metricGroup]));
  }

  setLineDotPosition(lineXPos, lineYPos, num) {
    this.svgGroups.selectAll('line.line-dot')
      .attr('opacity', 1)
      .attr('x1', lineXPos)
      .attr('x2', lineXPos);
    if (num !== undefined) {
      this.svgGroups.selectAll(`g.group-${num} line.line-dot-h`)
        .attr('opacity', 1)
        .attr('y1', lineYPos)
        .attr('y2', lineYPos);
    }
  }

  hideLineDot() {
    this.svgGroups.selectAll('line.line-dot, line.line-dot-h').attr('opacity', 0);
  }

  addBarplots(num, groups, groupBarplotMetrics, groupHeight) {
    const { groupsTopOffset } = this.options;
    const { barplotType } = this.options.xAxis;
    const metricByKeys = this.metricByKeys();
    const chartGroup = this.svgGroups.select(`g.group-${num}-chart`);
    const barWidth = this.bandX.bandwidth();
    const stackedData = d3.stack()
      .keys(groupBarplotMetrics.map((d) => d.name))(this.data);
    const { length } = this.data;

    chartGroup.append('g')
      .selectAll('g')
      .data(stackedData)
      .enter()
      .append('g')
      .attr('class', (d) => `barplot metric metric-${metricByKeys[d.key].n}`)
      .attr('fill', (d) => metricByKeys[d.key].color)
      .selectAll('rect')
      .data((data, nG) => data
        // тут убираю бары с 0 высотой
        .filter((d) => d[0] !== d[1])
        .map((d) => ({ ...d, metric: groupBarplotMetrics[nG] })))
      .enter()
      .append('rect')
      .attr('clip-path', `url(#group-rect-${num}-${this.id})`)
      .attr('x', (d) => this.x(d.data[this.xMetric]) - barWidth / 2)
      .attr('y', (d) => {
        const { metric } = d;
        const yName = metric.yAxisLink || metric.name;
        let val = d[1];
        if (barplotType === 'accumulation' && (val - d[0]) < 0) {
          // Negative values are not available in accumulation histograms
          throw new Error(`${metric.name}: Отрицательные значения недоступны на гистограммах накопления`);
        }
        if (barplotType === 'overlay') {
          val -= d[0];
        }
        if (val < 0) {
          const barHeight = this.y[yName](d[0]) - this.y[yName](d[1]);
          return this.y[yName](val) + barHeight;
        }
        return this.y[yName](val);
      })
      .attr('height', (d) => {
        const { metric } = d;
        const yName = metric.yAxisLink || metric.name;
        return Math.abs(this.y[yName](d[0]) - this.y[yName](d[1]));
      })
      .attr('width', barWidth)
      .on('click', (d) => this.clickChart([d.data[this.xMetric], d[1] - d[0]]))
      .on('mouseleave', () => {
        this.hideTooltip();
        this.hideLineDot();
      })
      .on('mouseenter', (d) => {
        const { metric } = d;
        const lineXPos = this.x(d.data[this.xMetric]);
        let lineYPos = this.y[metric.name](d[1]);
        if (barplotType === 'overlay') {
          lineYPos = this.y[metric.name](d[1] - d[0]);
        }
        this.setLineDotPosition(lineXPos, lineYPos, num);
        const tooltipLeftPos = lineXPos + this.maxYLeftAxisWidth;
        const tooltipTopPos = lineYPos + (groupHeight * num) + groupsTopOffset;
        this.updateTooltip(d.data, metric, tooltipLeftPos, tooltipTopPos);
      })
      .each(function (d, i) {
        const showText = ChartClass.lastDotParamForPoint(d.metric.lastDot, i, { length });
        if (d[1] !== null && d.metric.showText && showText) {
          d3.select(this.parentNode)
            .append('text')
            .attr('class', `metric metric-${d.metric.n}`)
            .attr('x', this.x.baseVal.value + barWidth / 2)
            .attr('y', this.y.baseVal.value + (d[1] < 0 ? (this.height.baseVal.value - 2) : 11))
            .attr('font-size', '11')
            .attr('pointer-events', 'none')
            .attr('text-anchor', 'middle')
            .attr('fill', 'var(--main_text)')
            .attr('stroke', 'var(--main_text)')
            .attr('stroke-width', 0)
            .text(`${ChartClass.valueToText(d.metric, d.data)} ${d.metric.unit || ''}`);
        }
      });
  }

  addDividedBarplots(num, groups, subgroups, groupHeight) {
    const chartGroup = this.svgGroups.select(`g.group-${num}-chart`);
    const { groupsTopOffset } = this.options;
    const barWidth = this.bandX.bandwidth();

    const xSubgroup = d3.scaleBand()
      .domain(subgroups)
      .range([0, barWidth])
      .padding([0.05]);

    const metricByKeys = this.metricByKeys();
    const { length } = this.data;

    chartGroup.append('g')
      .selectAll('g')
      .data(this.data)
      .enter()
      .append('g')
      .attr('transform', (d) => `translate(${this.x(d[this.xMetric]) - barWidth / 2},0)`)
      .selectAll('rect')
      .data((d, i) => subgroups.map((key) => ({
        key,
        value: d[key],
        color: metricByKeys[key].color,
        n: metricByKeys[key].n,
        metric: metricByKeys[key],
        data: d,
        _pn: i,
      })))
      .enter()
      .append('rect')
      .attr('clip-path', `url(#group-rect-${num}-${this.id})`)
      .attr('class', (d) => `barplot barplot-divided metric metric-${d.n}`)
      .attr('x', (d) => xSubgroup(d.key))
      .attr('y', (d) => {
        const yHeight = this.y[d.key](d.value);
        if (d.value < 0) {
          return this.y[d.key](0);
        }
        return yHeight;
      })
      .attr('width', xSubgroup.bandwidth())
      .attr('height', (d) => {
        const valHeight = this.y[d.key](d.value);
        const zeroHeight = this.y[d.key](0);
        return (d.value < 0)
          ? (valHeight - zeroHeight)
          : (zeroHeight - valHeight);
      })
      .attr('fill', (d) => d.color)
      .on('click', (d) => this.clickChart([d.data[this.xMetric], d.value]))
      .on('mouseenter', (d) => {
        const { metric } = d;
        const lineXPos = this.x(d.data[this.xMetric]);
        const lineYPos = this.y[metric.name](d.value);
        this.setLineDotPosition(lineXPos, lineYPos, num);

        const tooltipLeftPos = lineXPos + this.maxYLeftAxisWidth;
        const tooltipTopPos = lineYPos + (groupHeight * num) + groupsTopOffset;
        this.updateTooltip(d.data, metric, tooltipLeftPos, tooltipTopPos);
        this.showTooltip();
      })
      .on('mouseleave', () => {
        this.hideTooltip();
        this.hideLineDot();
      })
      .each(function (d) {
        // eslint-disable-next-line no-underscore-dangle
        const showText = ChartClass.lastDotParamForPoint(d.metric.lastDot, d._pn, { length });
        if (d.value !== null && d.metric.showText && showText) {
          d3.select(this.parentNode)
            .append('text')
            .attr('class', `metric metric-${d.metric.n}`)
            .attr('x', this.x.baseVal.value + xSubgroup.bandwidth() / 2)
            .attr('y', () => {
              const y = this.y.baseVal.value;
              const height = this.height.baseVal.value;
              let posY = y;
              if (d.value < 0) {
                posY += height + 10;
              } else {
                posY -= 2;
              }
              if (posY + 2 > groupHeight) {
                posY -= 12;
                this.darkText = true;
              }
              return posY;
            })
            .attr('font-size', '10')
            .attr('pointer-events', 'none')
            .attr('text-anchor', 'middle')
            .attr('fill', this.darkText ? 'var(--main_bg)' : 'var(--main_text)')
            .text(`${ChartClass.valueToText(d.metric, d.data)} ${d.metric.unit || ''}`);
        }
      });
  }

  clickChart(range) {
    if (this.onClickCb) {
      this.onClickCb(range);
    }
  }

  addBarplotPeakText() {
    const metricByKeys = this.metricByKeys();
    this.svgGroups
      .selectAll('.barplot.metric rect')
      .nodes()
      .forEach((rect) => {
        d3.select(rect.parentNode)
          .append('text')
          .attr('font-size', '11')
          .attr('pointer-events', 'none')
          .attr('text-anchor', 'start')
          .attr('fill', 'var(--main_text)')
          .attr('x', rect.x.baseVal.value)
          .attr('y', rect.y.baseVal.value + 14)
          // eslint-disable-next-line no-underscore-dangle
          .text((_) => ChartClass.valueToText(metricByKeys[_.key], rect.__data__.data));
      });
  }

  metricByKeys() {
    return this.metrics.reduce((prev, cur) => {
      prev[cur.name] = cur;
      return prev;
    }, {});
  }

  renderGroupError(num, message) {
    const chartGroup = this.svgGroups.select(`g.group-${num}-chart`);
    chartGroup
      .append('text')
      .attr('fill', 'red')
      .attr('font-size', '12px')
      .attr('text-anchor', 'start')
      .attr('x', 5)
      .attr('y', 5)
      .text(message);
  }

  /// static

  static capitalizeFirstLetter(str, template = null) {
    const result = str.charAt(0).toUpperCase() + str.slice(1);
    if (template) {
      return template.replace('?', result);
    }
    return result;
  }

  static isTimestamp(value) {
    return value > 1000000000 && value < 2000000000;
  }

  static isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  static mergeDeep(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();
    if (ChartClass.isObject(target) && ChartClass.isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (ChartClass.isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          ChartClass.mergeDeep(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      });
    }
    return ChartClass.mergeDeep(target, ...sources);
  }

  static valueToText(metric, data) {
    const captionKey = `_${metric.name}_caption`;
    const fieldName = (metric.peakTextData === 'caption' && data[captionKey] !== undefined)
      ? captionKey
      : metric.name;
    const val = data[fieldName];
    const { zerosAfterDot } = metric;
    return (zerosAfterDot % 1 === 0 && zerosAfterDot >= 0 && zerosAfterDot <= 100)
      ? Number.parseFloat(val).toFixed(zerosAfterDot ?? 2)
      : val;
  }

  static metricsToMetricsByGroup(metricsByGroup) {
    const metrics = [];
    metricsByGroup.forEach((group, nGroup) => {
      metrics.push(group.map((metric) => ({
        ...metric,
        group: nGroup,
      })));
    });
    return metrics.flat();
  }

  static canBeNumber(val) {
    // eslint-disable-next-line no-restricted-globals
    return !isNaN(parseInt(val, 10));
  }

  static lastDotParamForPoint(lastDot, i, { length }) {
    if (lastDot === '' || lastDot === null) {
      return false;
    }
    if (+lastDot === 0 && length === i + 1) {
      return true;
    }
    switch (lastDot) {
      case 'odd':
        if (i % 2 === 0) {
          return true;
        }
        break;
      case 'even':
        if (i % 2 === 1) {
          return true;
        }
        break;
      default:
        if (+lastDot > 0) {
          if ((i + 1) % lastDot === 0) {
            return true;
          }
        }
        break;
    }
    return false;
  }
}
