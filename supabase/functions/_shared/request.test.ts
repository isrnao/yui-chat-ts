// deno test --allow-env --allow-read supabase/functions/_shared/
import { assertEquals } from 'jsr:@std/assert@1';
import { readClient, resolveObservedIp } from './request.ts';

Deno.test('x-client は無ければ web、形の違う値は unknown にする', () => {
  assertEquals(readClient(new Headers()), 'web');
  assertEquals(readClient(new Headers({ 'x-client': 'android/0.1.0' })), 'android/0.1.0');
  assertEquals(readClient(new Headers({ 'x-client': '<script>' })), 'unknown');
  assertEquals(readClient(new Headers({ 'x-client': 'android/' + 'x'.repeat(40) })), 'unknown');
});

Deno.test('記録のための IP は x-forwarded-for の先頭、無ければ x-real-ip', () => {
  const req = (headers: Record<string, string>) => new Request('http://localhost/', { headers });
  assertEquals(
    resolveObservedIp(req({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })),
    '198.51.100.1'
  );
  assertEquals(resolveObservedIp(req({ 'x-real-ip': ' 203.0.113.4 ' })), '203.0.113.4');
  assertEquals(resolveObservedIp(req({})), '');
});
