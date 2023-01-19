import pluginMeta from './Plugin.Meta';
import PluginComponent from './PluginComponent.vue';

import {
  PanelPlugin,
  LogSystemAdapter,
  EventSystemAdapter,
  DataSourceSystemAdapter,
  StorageSystemAdapter, StyleSystemAdapter,
} from '../../DTCD-SDK';

export class VisualizationChart extends PanelPlugin {

  #id;
  #guid;
  #logSystem;
  #eventSystem;
  #storageSystem;
  #dataSourceSystem;
  #dataSourceSystemGUID;
  #styleSystem;
  #vueComponent;
  #vue
  #lastVisible
  #selector

  #config = {
    ...this.defaultConfig,
    dataSource: '',
  };

  static getRegistrationMeta() {
    return pluginMeta;
  }

  constructor(guid, selector) {
    super();

    this.#id = `${pluginMeta.name}[${guid}]`;
    this.#guid = guid;
    this.#logSystem = new LogSystemAdapter('0.5.0', guid, pluginMeta.name);
    this.#eventSystem = new EventSystemAdapter('0.4.0', guid);
    this.#eventSystem.registerPluginInstance(this, ['Clicked']);
    this.#storageSystem = new StorageSystemAdapter('0.5.0');
    this.#dataSourceSystem = new DataSourceSystemAdapter('0.2.0');
    this.#styleSystem = new StyleSystemAdapter('0.7.0')

    this.#dataSourceSystemGUID = this.getGUID(
      this.getSystem('DataSourceSystem', '0.2.0')
    );


    this.#selector = selector;


    this.#lastVisible = true

    this.createVueInstance()


    this.#logSystem.debug(`${this.#id} initialization complete`);
    this.#logSystem.info(`${this.#id} initialization complete`);

  }

  createVueInstance() {
    const { default: VueJS } = this.getDependence('Vue');

    const selector = this.#selector

    this.#vue = new VueJS({
      el: selector,
      data: () => ({}),
      render: h => h(PluginComponent),
      methods: {
        publishEventClicked: (value) => {
          this.#eventSystem.publishEvent('Clicked', value);
        }
      },
    })

    this.#vueComponent = this.#vue.$children[0];

    this.setColorPallet()

    this.setPluginConfig(this.#config)

    this.setResizeObserver(this.#vueComponent.$el, this.#vueComponent.setPanelSize)
  }

  setColorPallet() {
    const currentTheme = this.#styleSystem.getCurrentTheme()
    const colorsNames = ['aero', 'navi', 'brown', 'orange', 'yellow', 'mint', 'teal', 'cyan', 'indigo', 'purple', 'pink']
    const pallet = colorsNames.reduce((acc, color) => {
      return [
        ...acc,
        currentTheme.styleVariables[color]
      ]
    }, [])
    this.#vueComponent.setTheme(currentTheme.styleVariables);
    this.#vueComponent.setColorPallet(pallet);
  }

  beforeUninstall() {
    this.removeResizeObserver()
    this.#vue.$destroy();
    const newRootElement = document.createElement(`div`);
    newRootElement.id = this.#selector.replace('#', '')
    this.#vue.$el.parentElement.appendChild(newRootElement)
    this.#vue.$el.parentNode.removeChild(this.#vue.$el);
  }

  setVisible(isVisible) {
    if (this.#lastVisible !== isVisible) {
      isVisible ? this.createVueInstance() : this.beforeUninstall();
      this.#lastVisible = isVisible;
    }
  }

  loadData(data) {
    this.#vueComponent.setDataset(data);
  }

  processDataSourceEvent(eventData) {
    const { dataSource, status } = eventData;
    const data = this.#storageSystem.session.getRecord(dataSource);
    this.#logSystem.debug(
      `${this.#id} process DataSourceStatusUpdate({ dataSource: ${dataSource}, status: ${status} })`
    );
    this.loadData(data);
  }

  setVueComponentPropValue(prop, value) {
    const methodName = `set${prop.charAt(0).toUpperCase() + prop.slice(1)}`;
    if (this.#vueComponent[methodName]) {
      this.#vueComponent[methodName](value)
    } else {
      throw new Error(`В компоненте отсутствует метод ${methodName} для присвоения свойства ${prop}`)
    }
  }

  setPluginConfig(config = {}) {
    this.#logSystem.debug(`Set new config to ${this.#id}`);
    this.#logSystem.info(`Set new config to ${this.#id}`);

    const configProps = Object.keys(this.#config);

    for (const [prop, value] of Object.entries(config)) {
      if (!configProps.includes(prop)) continue;
      if (prop !== 'dataSource') {
        this.setVueComponentPropValue(prop, value)
      } else if (value) {
        if (this.#config[prop]) {
          this.#logSystem.debug(
            `Unsubscribing ${this.#id} from DataSourceStatusUpdate({ dataSource: ${this.#config[prop]}, status: success })`
          );
          this.#eventSystem.unsubscribe(
            this.#dataSourceSystemGUID,
            'DataSourceStatusUpdate',
            this.#guid,
            'processDataSourceEvent',
            { dataSource: this.#config[prop], status: 'success' },
          );
        }

        const dsNewName = value;

        this.#logSystem.debug(
          `Subscribing ${this.#id} for DataSourceStatusUpdate({ dataSource: ${dsNewName}, status: success })`
        );

        this.#eventSystem.subscribe(
          this.#dataSourceSystemGUID,
          'DataSourceStatusUpdate',
          this.#guid,
          'processDataSourceEvent',
          { dataSource: dsNewName, status: 'success' },
        );

        const ds = this.#dataSourceSystem.getDataSource(dsNewName);

        if (ds && ds.status === 'success') {
          const data = this.#storageSystem.session.getRecord(dsNewName);
          this.loadData(data);
        }
      }

      this.#config[prop] = value;
      this.#logSystem.debug(`${this.#id} config prop value "${prop}" set to "${value}"`);
    }
  }

  getPluginConfig() {
    return { ...this.#config };
  }

  setFormSettings(config) {
    this.setPluginConfig(config);
  }

  getFormSettings() {
    return {
      fields: [
        {
          component: 'title',
          propValue: 'Общие настройки',
        },
        {
          component: 'title',
          propValue: 'Источник данных',
        },
        {
          component: 'datasource',
          propName: 'dataSource',
          attrs: {
            label: 'Выберите источник данных',
            placeholder: 'Выберите значение',
            required: true,
          },
        },
        ...this.defaultFields,
      ],
    };
  }

  getState() {
    return Object.assign(
      this.getPluginConfig(),
      {
        dataset: this.#vueComponent.dataset,
        title: this.#vueComponent.title,

      },
    );
  }

  setState(newState) {
    if (typeof newState !== 'object' ) return;

    this.setPluginConfig(newState);

    const vueNamesFields = [
      'dataset',
      'title',
    ];

    for (const [prop, value] of Object.entries(newState)) {
      if (!vueNamesFields.includes(prop)) continue;
      this.#vueComponent[prop] = value;
    }
  }
}
