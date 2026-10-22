import { describe, expect, it } from 'vitest'
import { isPublicIp, safeFetch } from '../src/lib/safe-fetch.ts'

describe('safeFetch', () => {
  it('clasifica IPs', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) expect(isPublicIp(ip), ip).toBe(false)
    for (const ip of ['8.8.8.8', '74.208.210.20', '2606:4700::1111']) expect(isPublicIp(ip), ip).toBe(true)
  })
  it('IPv4 escondida en IPv6 (mapeada, compatible, NAT64, 6to4) se revisa como IPv4', async () => {
    for (const ip of ['::ffff:7f00:1', '::ffff:a9fe:a9fe', '0:0:0:0:0:ffff:7f00:0001', '::7f00:1', '::127.0.0.1', '64:ff9b::a9fe:a9fe', '64:ff9b::10.0.0.1', '2002:7f00:1::', '2002:c0a8:101::1', '100::1', '2001::1', 'fec0::1', 'ff02::1', 'FE80::1%eth0'])
      expect(isPublicIp(ip), ip).toBe(false)
    for (const ip of ['::ffff:808:808', '64:ff9b::808:808', '2002:808:808::1', '2001:4860:4860::8888']) expect(isPublicIp(ip), ip).toBe(true)
    await expect(safeFetch('http://[::ffff:127.0.0.1]/')).rejects.toThrow('blocked_ip')
    await expect(safeFetch('http://[::ffff:a9fe:a9fe]/latest/meta-data')).rejects.toThrow('blocked_ip')
    await expect(safeFetch('http://evil.test/', { resolve: async () => '::ffff:7f00:1' })).rejects.toThrow('blocked_ip')
  })
  it('rechaza hosts privados, esquemas raros y puertos', async () => {
    await expect(safeFetch('http://127.0.0.1/')).rejects.toThrow('blocked_ip')
    await expect(safeFetch('http://localhost/')).rejects.toThrow('blocked_ip')
    await expect(safeFetch('http://169.254.169.254/latest/meta-data')).rejects.toThrow('blocked_ip')
    await expect(safeFetch('file:///etc/passwd')).rejects.toThrow('bad_scheme')
    await expect(safeFetch('http://example.com:8080/')).rejects.toThrow('bad_port')
    await expect(safeFetch('http://evil.test/', { resolve: async () => '10.0.0.5' })).rejects.toThrow('blocked_ip')
  })
  it('sólo puertos 80/443 aunque el host resuelva a IP pública', async () => {
    await expect(safeFetch('http://pub.test:2375/', { resolve: async () => '8.8.8.8' })).rejects.toThrow('bad_port')
  })
})
