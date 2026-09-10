<?php

namespace App\Notifications\Exceptions;

use RuntimeException;

/**
 * Base type for every WhatsApp provider failure (Gate BACKEND-03 §9).
 * Messages on these are always safe to log — never build one by
 * interpolating a raw response body or request headers, which could leak
 * the API key.
 */
abstract class WhatsAppProviderException extends RuntimeException {}
