import { shallowMount } from '@vue/test-utils';
import Harvester from '@pkg/harvester-manager/machine-config/harvester.vue';
import { _CREATE, _EDIT } from '@shell/config/query-params';

const vGpuType = 'nvidia.com/NVIDIA_A2-4Q';
const errorKey = 'cluster.credential.harvester.vGpus.errors.notAllocatable';

const machinePool = (quantity: number, create: boolean, deviceName = vGpuType) => ({
  create,
  pool:   { quantity },
  config: { vgpuInfo: JSON.stringify({ vGPURequests: [{ deviceName }] }) }
});

interface HarvesterInstance {
  validatorVGpus(errors: string[]): void;
}

describe('Harvester vGPU validation', () => {
  it.each([
    {
      name:        'allows updating an existing pool with only one spare device',
      mode:        _EDIT,
      pools:       [machinePool(3, false)],
      allocatable: 1,
      required:    null
    },
    {
      name:        'rejects updating an existing pool without a spare device',
      mode:        _EDIT,
      pools:       [machinePool(3, false)],
      allocatable: 0,
      required:    1
    },
    {
      name:        'requires one device per node when creating a cluster',
      mode:        _CREATE,
      pools:       [machinePool(3, true)],
      allocatable: 1,
      required:    3
    },
    {
      name:        'allows creating a cluster with enough devices for every node',
      mode:        _CREATE,
      pools:       [machinePool(3, true)],
      allocatable: 3,
      required:    null
    },
    {
      name:        'requires one device per node for a new pool on an existing cluster',
      mode:        _EDIT,
      pools:       [machinePool(3, true)],
      allocatable: 1,
      required:    3
    },
    {
      name:        'allows a new pool on an existing cluster with enough devices',
      mode:        _EDIT,
      pools:       [machinePool(3, true)],
      allocatable: 3,
      required:    null
    },
    {
      name:        'aggregates per-node requirements across new pools',
      mode:        _CREATE,
      pools:       [machinePool(3, true), machinePool(2, true)],
      allocatable: 4,
      required:    5
    },
    {
      name:        'counts one spare per existing pool alongside new pool devices',
      mode:        _EDIT,
      pools:       [machinePool(3, false), machinePool(2, true)],
      allocatable: 2,
      required:    3
    },
    {
      name:        'allows mixed pools with enough spare and new devices',
      mode:        _EDIT,
      pools:       [machinePool(3, false), machinePool(2, true)],
      allocatable: 3,
      required:    null
    },
    {
      name:        'counts one spare for each existing pool sharing a device type',
      mode:        _EDIT,
      pools:       [machinePool(3, false), machinePool(2, false)],
      allocatable: 1,
      required:    2
    },
    {
      name:        'does not count pools requesting a different device type',
      mode:        _EDIT,
      pools:       [machinePool(3, false), machinePool(5, true, 'nvidia.com/other')],
      allocatable: 1,
      required:    null
    },
    {
      name:        'preserves support for unknown device capacity',
      mode:        _EDIT,
      pools:       [machinePool(3, false)],
      allocatable: null,
      required:    null
    },
    {
      name:        'rejects creating a cluster when no devices are available',
      mode:        _CREATE,
      pools:       [machinePool(3, true)],
      allocatable: 0,
      required:    3
    }
  ])('$name', ({
    mode, pools, allocatable, required
  }) => {
    const translate = (key: string, options?: Record<string, unknown>) => JSON.stringify({ key, ...options });
    const wrapper = shallowMount(Harvester, {
      props: {
        mode,
        credentialId: 'credential',
        uuid:         'pool',
        poolIndex:    0,
        machinePools: pools,
        value:        { ...pools[0].config, userData: '' }
      },
      data() {
        return {
          vGpuDevices: {
            device: {
              id:      'device',
              enabled: true,
              type:    vGpuType,
              allocatable
            }
          }
        };
      },
      global: {
        mocks: {
          $fetchState: { pending: true },
          $store:      { getters: { 'i18n/t': translate } }
        }
      }
    });
    const errors: string[] = [];
    const vm = wrapper.vm as HarvesterInstance;

    vm.validatorVGpus(errors);

    expect(errors).toStrictEqual(required === null ? [] : [JSON.stringify({
      key:       errorKey,
      vGpu:      vGpuType,
      allocated: required,
      allocatable
    })]);

    wrapper.unmount();
  });
});
