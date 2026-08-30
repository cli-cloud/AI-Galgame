/**
 * IoT功能快速验证脚本
 * 在浏览器控制台中执行，验证所有IoT API是否正常工作
 */

(async function testIoTIntegration() {
  console.log('🧪 开始IoT功能集成测试...\n');
  
  const results = {
    passed: [],
    failed: []
  };

  function pass(test) {
    console.log(`✅ ${test}`);
    results.passed.push(test);
  }

  function fail(test, error) {
    console.error(`❌ ${test}: ${error}`);
    results.failed.push({ test, error });
  }

  // ==================== 测试1: API存在性检查 ====================
  console.log('\n📋 测试1: 检查API是否正确暴露\n');
  
  try {
    if (typeof window.electronAPI === 'undefined') {
      throw new Error('window.electronAPI 不存在');
    }
    pass('window.electronAPI 存在');
  } catch (e) {
    fail('window.electronAPI', e.message);
    return; // 无法继续测试
  }

  // 检查window对象
  try {
    if (!window.electronAPI.window) throw new Error('不存在');
    pass('window.electronAPI.window 存在');
    
    if (typeof window.electronAPI.window.openIoTPanel !== 'function') {
      throw new Error('openIoTPanel 方法不存在');
    }
    pass('window.openIoTPanel() 方法存在');
    
    if (typeof window.electronAPI.window.openSRITest !== 'function') {
      throw new Error('openSRITest 方法不存在');
    }
    pass('window.openSRITest() 方法存在');
  } catch (e) {
    fail('window API', e.message);
  }

  // 检查iot对象
  try {
    if (!window.electronAPI.iot) throw new Error('不存在');
    pass('window.electronAPI.iot 存在');
    
    const iotMethods = [
      'connectSerial',
      'disconnectSerial', 
      'listSerialPorts',
      'onSerialData',
      'onSerialError'
    ];
    
    for (const method of iotMethods) {
      if (typeof window.electronAPI.iot[method] !== 'function') {
        throw new Error(`${method} 方法不存在`);
      }
      pass(`iot.${method}() 方法存在`);
    }
  } catch (e) {
    fail('iot API', e.message);
  }

  // 检查ipc对象
  try {
    if (!window.electronAPI.ipc) throw new Error('不存在');
    pass('window.electronAPI.ipc 存在');
    
    const ipcMethods = ['invoke', 'send', 'on'];
    for (const method of ipcMethods) {
      if (typeof window.electronAPI.ipc[method] !== 'function') {
        throw new Error(`${method} 方法不存在`);
      }
      pass(`ipc.${method}() 方法存在`);
    }
  } catch (e) {
    fail('ipc API', e.message);
  }

  // 检查storage对象
  try {
    if (!window.electronAPI.storage) throw new Error('不存在');
    pass('window.electronAPI.storage 存在');
    
    if (typeof window.electronAPI.storage.get !== 'function') {
      throw new Error('get 方法不存在');
    }
    pass('storage.get() 方法存在');
    
    if (typeof window.electronAPI.storage.set !== 'function') {
      throw new Error('set 方法不存在');
    }
    pass('storage.set() 方法存在');
  } catch (e) {
    fail('storage API', e.message);
  }

  // ==================== 测试2: 串口功能 ====================
  console.log('\n📋 测试2: 串口功能测试\n');
  
  try {
    console.log('正在列出可用串口...');
    const ports = await window.electronAPI.iot.listSerialPorts();
    
    if (Array.isArray(ports)) {
      pass(`listSerialPorts() 返回数组，找到 ${ports.length} 个串口`);
      
      if (ports.length > 0) {
        console.log('\n可用串口列表:');
        ports.forEach((port, i) => {
          console.log(`  ${i + 1}. ${port.path}`);
          console.log(`     制造商: ${port.manufacturer || '未知'}`);
          console.log(`     序列号: ${port.serialNumber || '无'}`);
        });
      } else {
        console.warn('⚠️ 未找到串口设备，请连接USB设备后重试');
      }
    } else {
      throw new Error('返回值不是数组');
    }
  } catch (e) {
    fail('listSerialPorts()', e.message);
  }

  // ==================== 测试3: 存储功能 ====================
  console.log('\n📋 测试3: 数据存储测试\n');
  
  try {
    const testKey = 'iotApiVerificationTest';
    const testData = {
      timestamp: Date.now(),
      version: '1.0.0',
      test: true
    };
    
    // 写入测试
    console.log('正在写入测试数据...');
    await window.electronAPI.storage.set(testKey, testData);
    pass('storage.set() 写入成功');
    
    // 读取测试
    console.log('正在读取测试数据...');
    const readData = await window.electronAPI.storage.get(testKey);
    
    if (!readData) {
      throw new Error('读取数据为空');
    }
    
    if (JSON.stringify(readData) !== JSON.stringify(testData)) {
      throw new Error('读取的数据与写入的数据不一致');
    }
    
    pass('storage.get() 读取成功，数据一致');
    
    // 清理测试数据
    await window.electronAPI.storage.set(testKey, null);
  } catch (e) {
    fail('storage 存储测试', e.message);
  }

  // ==================== 测试4: SRI数据检查 ====================
  console.log('\n📋 测试4: SRI测试结果检查\n');
  
  try {
    const sriData = await window.electronAPI.storage.get('sriTestResult');
    
    if (sriData && sriData.scores) {
      pass('SRI测试结果已保存');
      console.log(`  总分: ${sriData.scores.total}`);
      console.log(`  情感维度: ${sriData.scores.emotional}`);
      console.log(`  生理维度: ${sriData.scores.physical}`);
      console.log(`  社交维度: ${sriData.scores.social}`);
      console.log(`  测试时间: ${new Date(sriData.timestamp).toLocaleString()}`);
    } else {
      console.warn('⚠️ 尚未完成SRI测试');
      console.log('  提示: 打开IoT面板 → SRI测试标签 → 开始测试');
    }
  } catch (e) {
    fail('SRI数据检查', e.message);
  }

  // ==================== 测试5: IoT管理器检查 ====================
  console.log('\n📋 测试5: IoT管理器状态检查\n');
  
  try {
    if (typeof window.iotManager === 'undefined') {
      console.warn('⚠️ window.iotManager 未加载');
      console.log('  提示: 确保 iot-manager.js 已在页面中引入');
    } else {
      pass('window.iotManager 存在');
      
      const status = window.iotManager.getStatus();
      console.log('  IoT状态:');
      console.log(`    已启用: ${status.enabled ? '是' : '否'}`);
      console.log(`    已连接: ${status.connected ? '是' : '否'}`);
      console.log(`    SRI已测试: ${status.sriTested ? '是' : '否'}`);
      if (status.sriTested) {
        console.log(`    SRI分数: ${status.sriScore}`);
      }
      console.log(`    游戏模式: ${status.gameMode}/10`);
      console.log(`    心率上限: ${status.heartRateTarget} BPM`);
    }
  } catch (e) {
    fail('IoT管理器检查', e.message);
  }

  // ==================== 测试总结 ====================
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试总结\n');
  console.log(`✅ 通过: ${results.passed.length} 项`);
  console.log(`❌ 失败: ${results.failed.length} 项`);
  
  if (results.failed.length > 0) {
    console.log('\n失败的测试:');
    results.failed.forEach(({ test, error }) => {
      console.log(`  ❌ ${test}: ${error}`);
    });
  }
  
  console.log('='.repeat(60));
  
  if (results.failed.length === 0) {
    console.log('\n🎉 所有测试通过！IoT功能集成成功！\n');
    console.log('📝 下一步操作:');
    console.log('  1. 打开IoT面板: await window.electronAPI.window.openIoTPanel()');
    console.log('  2. 完成SRI测试（如果还没做）');
    console.log('  3. 连接IoT设备开始游戏');
  } else {
    console.log('\n⚠️ 部分测试失败，请检查上述错误信息');
    console.log('📚 参考文档: IoT/IMPLEMENTATION-COMPLETE.md');
  }
  
  return {
    passed: results.passed.length,
    failed: results.failed.length,
    total: results.passed.length + results.failed.length,
    success: results.failed.length === 0
  };
})();
