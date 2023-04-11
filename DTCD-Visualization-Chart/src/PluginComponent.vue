<template>
  <div class="VisualizationMultiline" style="height: 100%">
    <div
      v-if="title"
      class="title"
      v-text="title"
    />
   <chart-component
    :panelSize="panelSize"
    :dataRestFrom="dataset"
    :pallet="pallet"
    :theme="theme"
    :curves="curves"
    :type="type"
    :useGroups="useGroups"
    :timeFormat="timeFormat"
    :xAxisCaptionRotate="xAxisCaptionRotate"
    :yAxisLink="yAxisLink"
    :hideXAxis="hideXAxis"
    :hideYAxis="hideYAxis"
    :xMetricFromData="xMetric"
    :showPeakDots="showPeakDots"
    :peakTextData="peakTextData"
    :zoomType="zoomType"
   />
  </div>
</template>

<script>

import ChartComponent from './components/ChartComponent';

export default {
  name: 'Chart',
  components: {
    ChartComponent
  },
  data: () => ({
    dataset: [],
    panelSize: {
      height:200,
      width:200
    },
    pallet: [],
    theme: {},
    options:{},
    curves:{},
    type: 'time',
    useGroups: true,
    timeFormat: '%d.%m.%y %H:%M',
    xAxisCaptionRotate: 45,
    yAxisLink: {},
    hideXAxis: false,
    hideYAxis: false,
    xMetric: '',
    showPeakDots: {},
    peakTextData: [],
    zoomType: 'x',


    title: '',
    titleFromConfig: ''
  }),
  methods: {
    setColorPallet(pallet) {
      this.pallet = pallet;
    },
    setTheme(theme) {
      this.theme = theme;
    },
    setPanelSize(panelSize) {
      this.panelSize = panelSize
    },

    // validateTemplate({metricsCount, template}){
    //   if (metricsCount < 0 && metricsCount > 6 || template < 1) {
    //     return false
    //   }
    //   const maxTemplatesForMetricsCount = {
    //     1:1,
    //     2:2,
    //     3:6,
    //     4:7,
    //     5:4,
    //     6:2,
    //   }
    //
    //   return maxTemplatesForMetricsCount[metricsCount] >= template
    // },
    setTitle(title = '') {
      this.titleFromConfig = title;
    },
    isServiceFields(item) {
      const serviceFields = [
        '_header',
        '_curves',
        '_scaleType',
        '_useGroups',
        '_timeFormat',
        '_xAxisCaptionRotate',
        '_yAxisLinks',
        '_hideXAxis',
        '_hideYAxis',
        '_xMetricFromData',
        '_showPeakDots',
        '_peakTextData',
        '_zoomType',
      ]
     return serviceFields.reduce((acc, field) => {
       return Object.keys(item).includes(field) || acc
     },false)
    },
    isCorrectTextAngle(angle) {
      const angles = [
        45, -45, 90, -90
      ]

       return angles.includes(angle)
    },
    setDataset(data = []) {

      this.dataset = data.reduce((acc, item) => {
        if (!!(this.isServiceFields(item))) {
          this.title = this.titleFromConfig || item?._header || ''
          this.curves = item?._curves ? JSON.parse(item?._curves?.replaceAll("'", '"')) : {};
          this.type = item._scaleType || 'time'
          this.useGroups = item?._useGroups || false
          this.timeFormat = item?._timeFormat || '%d.%m.%y %H:%M';
          this.xAxisCaptionRotate = this.isCorrectTextAngle(item?._xAxisCaptionRotate)
            ? item._xAxisCaptionRotate
            : 45;
          this.yAxisLink = item._yAxisLinks ? JSON.parse(item._yAxisLinks?.replaceAll("'", '"')) : {};
          this.hideXAxis = item?._hideXAxis || false
          this.hideYAxis = item?._hideYAxis || false
          this.xMetric = item?._xMetric || ''
          this.showPeakDots = item?._showPeakDots ? JSON?.parse(item?._showPeakDots?.replaceAll("'", '"')) : {};
          this.peakTextData = item?._peakTextData ? JSON?.parse(item?._peakTextData?.replaceAll("'", '"')) : [];
          this.zoomType = item?._zoomType || 'x'
        }
        if (!(this.isServiceFields(item))) {
          return [...acc, item]
        }

        return acc
      },[])
    },
  },
};
</script>

<style lang="scss" scoped>
.VisualizationMultiline {
  width: 100%;
  height: 100%;
  padding: 10px;
  display: flex;
  flex-direction: column;
  .title {
    color: var(--text_main);
    font-size: 18px;
    font-weight: 700;
    padding-bottom: 10px;
  }
}

</style>
