<template>
    <div
      :style="customStyle"
      :class="customClass"
      v-bind="$attrs"
      class="chart-container"
    >
      <div
        ref="legend"
        class="legend"
        @mouseleave="chart ? chart.highlightMetric(metric) : () => {}"
      >
        <template v-for="(group) in metricsByGroup">
          <div
            v-for="(metric) in group
                .filter(({name, hideLegend}) => !hideLegend && name !== xMetric)"
            :key="metric.name"
            @mouseenter="chart ? chart.highlightMetric(metric) : () => {}"
          >
            <div
              class="circle"
              :style="`background-color: ${metric.color}`"
            />
            {{ metric.title || metric.name }}
          </div>
        </template>
      </div>
      <div 
        v-if="!dataRestFrom ||  dataRestFrom.length === 0" 
        class="NoData"
      >
        <span class="FontIcon name_infoCircleOutline Icon"></span>
        <span>Нет данных для отображения</span>
      </div>
      <div
        ref="svgContainer"
        class="svg-container"
        @dblclick="resetRange()"
      />
<!--      <div-->
<!--        v-show="dataRestFrom && dataRestFrom.length"-->
<!--        class="x-metric-text"-->
<!--      >-->
<!--        {{ xMetric }}-->
<!--      </div>-->
    </div>
  <!--  <DashChartSettings-->
  <!--    ref="chartSettings"-->
  <!--    v-model="isSettingsComponentOpen"-->
  <!--    :received-settings="receivedSettings"-->
  <!--    @save="saveSettings"-->
  <!--    @close="closeSettings"-->
  <!--  />-->
</template>


<script>
// import { mdiSettings } from '@mdi/js';
// import * as d3 from 'd3';
import ChartClass from '../js/ChartClass';
// import DashChartSettings from './dashChartSettings';


export default {
  name: 'ChartComponent',
  // components: { DashChartSettings },
  inheritAttrs: false,
  props: {
    panelSize: {
      type: Object,
      default: () => ({width: 600, height: 200})
    },
    dataRestFrom: {
      type: Array,
      default: () => ([])
    },
    pallet: {
      type: Array,
      default: () => ([])
    },
    theme: {
      type: Object,
      required: true,
    },
    curves: {
      type:Object,
      default: () => ({}),
    },
    type: {
      type: Object,
      default: 'time',
    },
    useGroups: {
      type: Boolean,
      default: true,
    },
    timeFormat: {
      type: String,
      default: '%d.%m.%y %H:%M',
    },
    xAxisCaptionRotate: {
      type: Number,
      default: 45
    },
    yAxisLink: {
      type: Object,
      default: () =>({}),
    },
    hideXAxis: {
      type: Boolean,
      default: false,
    },
    hideYAxis: {
      type: Boolean,
      default: false,
    },
    xMetricFromData: {
      type: String,
      default: '',
    },
    showPeakDots: {
      type: Object,
      default: () => ({}),
    },
    peakTextData: {
      type: Array,
      default: () => ([]),
    },
    zoomType: {
      type: String,
      default: 'x',
    },



    idFrom: {
      type: String,
      required: true,
    },
    idDashFrom: {
      type: String,
      required: true,
    },

    dataModeFrom: Boolean,
    /** Props from Reports page. */
    dataReport: Boolean,
    fullScreenMode: {
      type: Boolean,
      default: false,
    },
    customStyle: {
      type: Object,
      default: () => ({}),
    },
    customClass: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      actions: [
        { name: 'click', capture: ['pointX', 'pointY'] },
        { name: 'select', capture: ['start', 'end'] },
      ],
      chart: null,
      // mdiSettings,
      isSettingsComponentOpen: false,
      defaultSettings: {
      },
    };
  },
  computed: {
    id() {
      return this.idFrom;
    },
    idDash() {
      return this.idDashFrom;
    },
    tokensStore() {
      const { idDash } = this;
      return this.$store.state[idDash].tockens;
    },
    options() {
      return {
        ...this.defaultSettings,
      };
    },

    firstDataRow() {
      return this.dataRestFrom && this.dataRestFrom[0] || {};
    },
    firstDataRowMetricList() {
      return Object.keys(this.firstDataRow).filter(
        (key) => key.indexOf('caption') === -1 && key.indexOf('annotation') === -1,
      );
    },
    metrics() {
      return [...this.firstDataRowMetricList.filter((item) => !/^_.*_mark$/.test(item) && item !== this.xMetric)];
    },
    xAxisSettings() {
      if (this.options.xAxis) {
        return {
          ...this.options.xAxis,
          allMetrics: this.firstDataRowMetricList,
          xSelection: true,
        };
      }
      const {
        barplotstyle,
      } = this.options;
      return {
        xMetric: this.xMetric,
        type: (this.options?.stringOX || !ChartClass.isTimestamp(this.firstDataRow[this.xMetric]))
          ? 'linear' // linear, time, - log, point, band
          : 'time',
        timeFormat: this.timeFormat,
        textRotate: +this.xAxisCaptionRotate || -45,
        barplotType: barplotstyle || 'divided',
        allMetrics: this.firstDataRowMetricList,
      };
    },
    metricsByGroup() {
      // check current metrics config
      const metricsByGroup = [];
      const existsMetrics = [];
      if (this.options.metricsByGroup && this.options.metricsByGroup.length) {
        this.options.metricsByGroup.forEach((group) => {
          const metrics = [];
          group.forEach((metric) => {
            if (this.metrics.includes(metric.name)) {
              if (this.yAxisLink[metric.name]) {
                metric.yAxisLink = this.yAxisLink[metric.name]
              }
              existsMetrics.push(metric.name);
              if (!this.useGroups) {
                metricsByGroup.push([metric]);
              } else {
                metrics.push(metric);
              }
            }
          });
          if (metrics.length) {
            metricsByGroup.push(metrics);
          }
        });
      }

      // add new metrics config
      const newMetrics = this.metrics.filter((i) => existsMetrics.indexOf(i) < 0);
      if (newMetrics.length) {
        metricsByGroup.push([]);
        newMetrics.forEach((metricName, nN) => {
          const metric = this.getOldMetricConfig(metricName);
          if (this.yAxisLink[metricName]) {
            metric.yAxisLink = this.yAxisLink[metricName]
          }
          if (this.peakTextData.includes(metricName)) {
            metric.peakTextData = 'data'
            metric.showText = true
          } else {
            metric.showText = false
          }
          if (this.showPeakDots[metricName]) {
            metric.showPeakDots = this.showPeakDots[metricName]
            metric.dotSize = 4

          }
          if (!this.useGroups && metricsByGroup[metricsByGroup.length - 1].length > 0) {
            metricsByGroup.push([]);
          }
          metricsByGroup[metricsByGroup.length - 1].push(metric);
          // если тащим настройки со старого мультилайна то добавим группы для не united графиков
          if (this.options?.united === false && nN !== newMetrics.length - 1) {
            metricsByGroup.push([]);
          }
        });
      }
      return metricsByGroup;
    },

    xMetric() {
      const { xAxis = {} } = this.options;
      const { xMetric = null } = xAxis;
      if (xMetric) {
        return xMetric;
      }
      if (this.xMetricFromData) {
        return this.xMetricFromData
      }
      const [firstMetric] = this.firstDataRowMetricList;
      return firstMetric;
    },

    box() {
      const { width, height }= this.panelSize;
      const legendHeight = 30;
      const addedSpaceForXAxis = 20;
      // return {
      //   width: Math.round(width - 42),
      //   height: Math.round(height - 55) - 45,
      // };
      let newHeight = height - legendHeight
      newHeight -= !this.hideXAxis ? addedSpaceForXAxis : 0
      const box = {
        width,
        height:  newHeight,
      };
      return box
    },

    color() {
      return d3.scaleOrdinal()
      .domain(this.metrics)
      .range(this.pallet);
    },

    metricUnits() {
      return this?.dashStore?.metrics || [];
    },

    receivedSettings() {
      return {
        metricsByGroup: [...this.metricsByGroup],
        xAxis: { ...this.xAxisSettings },
        useGroups: !!this.useGroups,
      };
    },
  },
  watch: {
    dataRestFrom: {
      handler(val) {
        if (val.length > 0) {
          this.updateData();
        }
      },
      deep: true,
    },
    box(val, old) {
      if (JSON.stringify(val) !== JSON.stringify(old)) {
        this.updateBox();
      }
    },
    fullScreenMode() {
      this.$nextTick(() => {
        this.$nextTick(() => {
          this.chart.moveInNewContainer(this.$refs.svgContainer);
          this.updateBox();
        });
      });
    },
    // theme(val, old) {
    //   if (JSON.stringify(val) !== JSON.stringify(old)) {
    //     this.chart.theme = this.theme;
    //     this.chart.moveInNewContainer(this.$refs.svgContainer);
    //     this.updateBox();
    //   }
    // },
  },
  mounted() {
    if (this.dataRestFrom?.length > 0) {
      this.createChart();
      this.updateData();
    }
  },
  methods: {
    createChart() {
      const { width, height } = this.box;
      this.chart = new ChartClass(this.$refs.svgContainer, width, height, this.theme, {
        useGroups: !!this.useGroups,
        xAxis: {
          xSelection: true,
          hideXAxis: this.hideXAxis,
          type: this.type, // linear, time, - log, point, band
          timeFormat: this.timeFormat,
          nice: 100, // count
        },
        curves: this.curves,
        hideYAxis: this.hideYAxis,
        zoomType: this.zoomType,
      });
      this.chart.onZoom((range) => {
        this.$emit('SetRange', {
          range,
          xMetric: this.xMetric,
        });
        this.setClick(range, 'select');
      });
      this.chart.onClick((range) => {
        this.setClick(range, 'click');
      });
    },
    resetRange() {
      this.chart.setZoom([0,0], {})
    },
    setClick(point, actionName) {
      // if (!this.tokensStore) {
      //   return;
      // }
      const values = {
        pointX: point[0],
        pointY: point[1],
        start: point[0],
        end: point[1],
      };
      // const events = this.eventsStore({
      //   idDash,
      //   event: 'onclick',
      //   partelement: 'point',
      // });
      // events.forEach(({ event }) => {
      //   if (event.action === 'set') {
      //     this.$store.commit('letEventSet', { idDash, events });
      //   } else if (event.action === 'go' && actionName !== 'select') {
      //     this.$store.dispatch('letEventGo', {
      //       idDash,
      //       event,
      //       store: this.$store,
      //       route: this.$router,
      //     });
      //   }
      // });
    },

    eventsStore({ event, partelement }) {
      const { idDash } = this;
      let result = [];
      if (partelement) {
        result = this.$store.state[idDash].events?.filter((item) => (
          item.event === event
          && item.element === this.id
          && item.partelement === partelement
        )) || [];
      } else {
        result = this.$store.state[idDash].events?.filter(
          (item) => item.event === event
            && item.target === this.id,
        ) || [];
      }
      return result;
    },

    updateData() {
      if (!this.chart) {
        this.createChart();
      }
      this.chart.update(
        this.metricsByGroup,
        {
          hideXAxis: this.hideXAxis,
          type: this.type, // linear, time, - log, point, band
          timeFormat: this.timeFormat,
          nice: 100, // count
        },
        this.dataRestFrom,
        this.curves,
        this.hideYAxis,
        this.zoomType,
        this.xMetric,
      );
    },
    updateBox() {
      const { width, height } = this.box;
      if (this.chart) {
        this.chart.updateBox(width, height);
      }
    },

    getStyleLine(type) {
      if (type === 'dashed') {
        return '5,5';
      } if (type === 'dotted') {
        return '1,3';
      } if (type === 'double') {
        return '1, 3, 6, 3';
      }
      return '0';
    },

    getOldMetricConfig(name) {
      const {
        metricTypes = {},
        optionsColor = {},
        // metricsAxis = {},
        yAxesBinding,
        color: optionColor = {},
        // eslint-disable-next-line camelcase
        conclusion_count = {},
        // eslint-disable-next-line camelcase
        replace_count = {},
        isDataAlwaysShow = false,
        lastDot = false,
      } = this.options;

      const metricOptions = this.options.metrics?.find((item) => item.name === name) || {};
      const metricTypesOptions = metricTypes[name] || metricOptions.type || 'line';

      const isBarplot = (yAxesBinding && yAxesBinding.metricTypes[name])
        ? (yAxesBinding.metricTypes[name] === 'barplot' || metricTypes[name] === 'barplot')
        : ['Bar chart', 'barplot'].includes(metricTypesOptions);

      const color = (!isBarplot && !this.options.united)
        ? (optionsColor[name] || optionColor[name] || this.color(name))
        : this.color(name);

      const zerosAfterDot = parseInt(replace_count[name], 10) ?? null;
      const enabledBounding = metricOptions.manualBorder === true;
      const upperBound = parseFloat(metricOptions.upborder);
      const lowerBound = parseFloat(metricOptions.lowborder);
      const typeLine = (!isBarplot && !this.options.united && this.options.type_line)
        ? this.options.type_line[name]
        : null;
      const unit = this.metricUnits.find((d) => d.name === name);

      return {
        color,
        name,
        type: isBarplot ? 'barplot' : 'line',
        // yAxisSide: (this.options.united && metricsAxis[name]) === 'right' ? 'right' : 'left',
        yAxisSide: 'left',
        // eslint-disable-next-line no-nested-ternary
        lastDot: conclusion_count[name] || (isDataAlwaysShow ? 1 : (lastDot ? 0 : '')),
        // eslint-disable-next-line no-restricted-globals
        zerosAfterDot: isNaN(zerosAfterDot) ? 2 : zerosAfterDot,
        peakTextData: isDataAlwaysShow || false,
        showPeakDots: conclusion_count[name] > 0
          || isDataAlwaysShow
          || lastDot,
        showText: isDataAlwaysShow
          || conclusion_count[name] > 0
          || lastDot,
        // eslint-disable-next-line no-restricted-globals
        upperBound: (!enabledBounding || isNaN(upperBound)) ? null : upperBound,
        // eslint-disable-next-line no-restricted-globals
        lowerBound: (!enabledBounding || isNaN(lowerBound)) ? null : lowerBound,
        dotSize: 4,
        strokeDasharray: this.getStyleLine(typeLine),
        unit: unit?.units,
        strokeWidth: 1,
      };
    },
  },
};
</script>

<style lang="scss" scoped>
@import "../scss/_colors";
.chart-container {
  padding: 10px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.svg-container {
  position: relative;
}

.x-metric-text {
  font-size: 11px;
}

.legend {
  text-align: left;
  cursor: pointer;
  font-size: 13px;

  & > div {
    display: inline-block;
    padding: 2px 16px 2px 0;
  }

  .circle {
    display: inline-block;
    border-radius: 50%;
    width: 10px;
    height: 10px;
    margin-right: 4px;
  }
}
.NoData {
  display: flex;
  width: 100%;
  align-items: center;
  flex-direction: column;
  color: var(--text_secondary);
  .Icon {
    color: var(--border_secondary);
    font-size: 100px;
    margin-bottom: 8px;
  }
}
</style>

