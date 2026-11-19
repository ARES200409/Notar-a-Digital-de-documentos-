<?php
// Entrada local de Laragon. Nunca expone código, certificados ni data/.
declare(strict_types=1);
$host = $_SERVER['HTTP_HOST'] ?? '';
$remote = $_SERVER['REMOTE_ADDR'] ?? '';
if (!in_array($remote, ['127.0.0.1', '::1'], true) || !preg_match('/^(proto\.test|localhost|127\.0\.0\.1)(:\d+)?$/D', $host)) {
    http_response_code(403);
    exit('Acceso permitido únicamente desde este equipo.');
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && $origin !== 'http://' . $host) {
    http_response_code(403);
    exit('Origen no permitido.');
}
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$route = parse_url($uri, PHP_URL_PATH);
// Laragon también abre proyectos como localhost/proto/. Canonizar la entrada
// evita que las rutas absolutas de estilos y API apunten a otro sitio.
if (preg_match('/^\/(?:proto(?:\/(?:index\.php|public(?:\/index\.html)?)?)?|public(?:\/index\.html)?)\/?$/D', $route)) {
    header('Location: http://proto.test/', true, 302);
    header('Cache-Control: no-store');
    exit;
}
$allowed = ['/', '/index.php', '/app.js', '/style.css', '/api/status', '/api/demo', '/api/record', '/api/history', '/api/verify', '/api/register', '/api/approve', '/api/cancel', '/api/authorize', '/api/transfer'];
if (!in_array($route, $allowed, true)) {
    http_response_code(404);
    exit('Ruta no encontrada.');
}
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'POST', 'HEAD'], true)) {
    http_response_code(405);
    exit('Método no permitido.');
}
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 7 * 1024 * 1024) {
    http_response_code(413);
    exit('Solicitud demasiado grande.');
}
$input = fopen('php://input', 'rb');
$body = stream_get_contents($input, 7 * 1024 * 1024 + 1);
fclose($input);
if (strlen($body) > 7 * 1024 * 1024) {
    http_response_code(413);
    exit('Solicitud demasiado grande.');
}
$query = parse_url($uri, PHP_URL_QUERY);
$target = 'http://127.0.0.1:3000' . ($route === '/index.php' ? '/' : $route) . ($query ? '?' . $query : '');
$curl = curl_init($target);
$headers = ['Content-Type: ' . ($_SERVER['CONTENT_TYPE'] ?? 'application/json')];
if (isset($_SERVER['HTTP_X_NOTARIA_TOKEN'])) $headers[] = 'X-Notaria-Token: ' . $_SERVER['HTTP_X_NOTARIA_TOKEN'];
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT => 60,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_HEADERFUNCTION => static function ($handle, string $line): int {
        $name = strtolower(trim(explode(':', $line, 2)[0]));
        if (in_array($name, ['content-type', 'cache-control', 'content-security-policy', 'x-content-type-options'], true)) header(trim($line));
        return strlen($line);
    },
]);
if ($method === 'POST') curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
if ($method === 'HEAD') curl_setopt($curl, CURLOPT_NOBODY, true);
$result = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
if ($result === false) {
    error_log('NotariaDigital: ' . curl_error($curl));
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Iniciar Notaría Digital</title><body><h1>Notaría Digital</h1><p>Laragon está funcionando. Falta iniciar el servidor de documentos.</p><p>En la terminal de Laragon ejecuta:</p><pre>cd C:\laragon\www\proto<br>npm.cmd start</pre><p>Mantén esa terminal abierta y <a href="/">recarga esta página</a>.</p></body></html>';
} else {
    http_response_code($status ?: 502);
    echo $result;
}
curl_close($curl);
