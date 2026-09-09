<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\MePayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Deliberately NOT behind resolve-current-company: a user with more than
 * one membership must be able to call /me (to see the list and choose)
 * before any active company exists.
 */
class MeController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        return response()->json(MePayload::build($request->user()));
    }
}
