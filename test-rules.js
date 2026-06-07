const http = require('http');

const BASE_URL = 'localhost';
const PORT = 3000;

function request(path, method, data) {
  method = method || 'GET';
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: BASE_URL,
      port: PORT,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    var req = http.request(options, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function waitForServer() {
  console.log('⏳ 等待服务器启动...');
  var count = 0;
  function check() {
    return request('/api/departments').then(function() {
      console.log('✅ 服务器已启动');
      return true;
    }).catch(function() {
      count++;
      if (count >= 30) {
        console.log('❌ 服务器启动超时');
        return false;
      }
      return sleep(1000).then(check);
    });
  }
  return check();
}

function runTests() {
  console.log('============================================================');
  console.log('🧪 医疗废物转运交接系统 - 业务规则验证测试');
  console.log('============================================================');

  return waitForServer().then(function(ready) {
    if (!ready) return;

    var passed = 0, failed = 0;

    console.log('\n📋 测试 1: 获取基础数据（科室、周转箱）');
    return Promise.all([request('/api/departments'), request('/api/containers')]).then(function(results) {
      var depts = results[0], containers = results[1];
      console.log('  科室数量:', depts.data.data.length, ', 周转箱数量:', containers.data.data.length);
      if (depts.data.success && containers.data.success) {
        console.log('  ✅ 通过');
        passed++;
      } else {
        console.log('  ❌ 失败');
        failed++;
      }
    }).catch(function(e) { console.log('  ❌ 失败:', e.message); failed++; })

    .then(function() {
      console.log('\n📋 测试 2: 创建正常包装的交接记录');
      var normalTransferId = null;
      return request('/api/departments').then(function(depts) {
        return request('/api/containers/available').then(function(containers) {
          return request('/api/transfers', 'POST', {
            department_id: depts.data.data[0].id,
            container_id: containers.data.data[0].id,
            waste_type: '感染性',
            package_damaged: 0,
            packed_by: '张护士'
          });
        });
      }).then(function(res) {
        normalTransferId = res.data.data.id;
        console.log('  创建记录 ID:', normalTransferId, ', 状态:', res.data.data.status);
        if (res.data.success && res.data.data.status === 'packed') {
          console.log('  ✅ 通过');
          passed++;
        } else {
          console.log('  ❌ 失败');
          failed++;
        }
        return normalTransferId;
      }).catch(function(e) { console.log('  ❌ 失败:', e.message); failed++; return null; });
    })

    .then(function(normalTransferId) {
      console.log('\n📋 测试 3: 创建破损包装的交接记录');
      var damagedTransferId = null;
      return request('/api/departments').then(function(depts) {
        return request('/api/containers/available').then(function(containers) {
          return request('/api/transfers', 'POST', {
            department_id: depts.data.data[1].id,
            container_id: containers.data.data[0].id,
            waste_type: '病理性',
            package_damaged: 1,
            packed_by: '李护士'
          });
        });
      }).then(function(res) {
        damagedTransferId = res.data.data.id;
        console.log('  创建记录 ID:', damagedTransferId, ', 包装破损:', res.data.data.package_damaged);
        if (res.data.success && res.data.data.package_damaged === 1) {
          console.log('  ✅ 通过');
          passed++;
        } else {
          console.log('  ❌ 失败');
          failed++;
        }
        return { normalId: normalTransferId, damagedId: damagedTransferId };
      }).catch(function(e) { console.log('  ❌ 失败:', e.message); failed++; return { normalId: normalTransferId, damagedId: null }; });
    })

    .then(function(ids) {
      console.log('\n📋 测试 4: 【重点验证】破损包装不能交接称重');
      return request('/api/transfers/' + ids.damagedId + '/weigh', 'PUT', {
        weight: 10,
        weighed_by: '王转运'
      }).then(function(res) {
        console.log('  响应状态码:', res.status);
        console.log('  响应消息:', res.data.message);
        if (res.status === 400 && res.data.message.indexOf('包装破损') >= 0) {
          console.log('  ✅ 通过 - 破损包装正确阻止了交接');
          passed++;
        } else {
          console.log('  ❌ 失败 - 破损包装应该被阻止交接');
          failed++;
        }
        return ids;
      }).catch(function(e) { console.log('  ❌ 失败:', e.message); failed++; return ids; });
    })

    .then(function(ids) {
      console.log('\n📋 测试 5: 正常包装可以称重交接');
      return request('/api/transfers/' + ids.normalId + '/weigh', 'PUT', {
        weight: 15,
        weighed_by: '王转运'
      }).then(function(res) {
        var data = res.data.data || {};
        console.log('  称重后状态:', data.status, ', 重量:', data.weight, 'kg');
        if (res.data.success && data.status === 'weighed' && data.weight === 15) {
          console.log('  ✅ 通过');
          passed++;
        } else {
          console.log('  ❌ 失败');
          failed++;
        }
        return ids.normalId;
      }).catch(function(e) { console.log('  ❌ 失败:', e.message); failed++; return ids.normalId; });
    })

    .then(function(normalTransferId) {
      console.log('\n📋 测试 6: 【重点验证】重量超过周转箱上限要拆箱');
      var heavyTransferId = null;
      return request('/api/departments').then(function(depts) {
        return request('/api/containers/available').then(function(containers) {
          return request('/api/transfers', 'POST', {
            department_id: depts.data.data[2].id,
            container_id: containers.data.data[0].id,
            waste_type: '损伤性',
            package_damaged: 0,
            packed_by: '赵护士'
          });
        });
      }).then(function(createRes) {
        heavyTransferId = createRes.data.data.id;
        var maxWeight = createRes.data.data.max_weight;
        var overWeight = maxWeight + 5;
        console.log('  周转箱上限:', maxWeight, 'kg, 测试超重:', overWeight, 'kg');
        return request('/api/transfers/' + heavyTransferId + '/weigh', 'PUT', {
          weight: overWeight,
          weighed_by: '王转运'
        });
      }).then(function(res) {
        console.log('  响应状态码:', res.status);
        console.log('  响应消息:', res.data.message);
        if (res.status === 400 && res.data.message.indexOf('超过周转箱上限') >= 0) {
          console.log('  ✅ 通过 - 超重正确提示拆箱');
          passed++;
        } else {
          console.log('  ❌ 失败 - 超重应该提示拆箱');
          failed++;
        }
        return normalTransferId;
      }).catch(function(e) { console.log('  ❌ 失败:', e.message); failed++; return normalTransferId; });
    })

    .then(function(normalTransferId) {
      console.log('\n📋 测试 7: 正常签收流程');
      return request('/api/transfers/' + normalTransferId + '/sign', 'PUT', {
        signed_by: '刘主管'
      }).then(function(res) {
        var data = res.data.data || {};
        console.log('  签收后状态:', data.status, ', 签收人:', data.signed_by);
        if (res.data.success && data.status === 'signed') {
          console.log('  ✅ 通过');
          passed++;
        } else {
          console.log('  ❌ 失败');
          failed++;
        }
        return normalTransferId;
      }).catch(function(e) { console.log('  ❌ 失败:', e.message); failed++; return normalTransferId; });
    })

    .then(function(normalTransferId) {
      console.log('\n📋 测试 8: 【重点验证】签收后交接重量不可修改');
      return request('/api/transfers/' + normalTransferId + '/weigh', 'PUT', {
        weight: 20,
        weighed_by: '王转运'
      }).then(function(res) {
        console.log('  响应状态码:', res.status);
        console.log('  响应消息:', res.data.message);
        if (res.status === 400 && res.data.message.indexOf('已签收') >= 0) {
          console.log('  ✅ 通过 - 签收后正确阻止了重量修改');
          passed++;
        } else {
          console.log('  ❌ 失败 - 签收后不应该能修改重量');
          failed++;
        }
      }).catch(function(e) { console.log('  ❌ 失败:', e.message); failed++; });
    })

    .then(function() {
      console.log('\n📋 测试 9: 后勤主管查看统计数据');
      return request('/api/stats').then(function(res) {
        var data = res.data.data || {};
        console.log('  总记录:', data.total, ', 已签收:', data.signed, ', 总重量:', data.totalWeight, 'kg');
        if (res.data.success && data.total >= 3) {
          console.log('  ✅ 通过');
          passed++;
        } else {
          console.log('  ❌ 失败');
          failed++;
        }
      }).catch(function(e) { console.log('  ❌ 失败:', e.message); failed++; });
    })

    .then(function() {
      console.log('\n============================================================');
      console.log('📊 测试结果: 通过', passed, '项, 失败', failed, '项');
      if (failed === 0) {
        console.log('🎉 所有测试通过！业务规则验证成功。');
      } else {
        console.log('⚠️  有测试未通过，请检查代码。');
      }
      console.log('============================================================');
    });
  });
}

runTests().catch(console.error);
