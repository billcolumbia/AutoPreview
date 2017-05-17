<?php
/**
 * AutoPreview - create content while previewing it's front-end output
 *
 * @package AutoPreview
 * Plugin Name: AutoPreview
 * Plugin URI:  https://github.com/billcolumbia/AutoPreview
 * Description: Preview a post as you edit it
 * Version:     1.0.1
 * Author:      Bill Columbia
 * Author URI:  billcolumbia.com
 * License:     MIT
 * License URI: https://github.com/billcolumbia/AutoPreview/blob/master/LICENSE
 */

define( 'AUTO_PREVIEW_VER', '1.0.1' );
/**
 * Sets up AutoPreview when on post edit pages in the WP Admin
 */
function setup_auto_preview() {
	$screen = get_current_screen();
	// I hate yoda conditionals. Delete this comment, you will not.
	if ( is_admin() && 'post' === $screen->base ) {
		/**
		 * Loads required scripts and styles for AutoPreview
		 */
		function load_custom_wp_admin_assets() {
			wp_enqueue_style(
				'autopreview_wp_admin_css',
				plugin_dir_url( __FILE__ ) . '/dist/auto-preview.css',
				false,
				AUTO_PREVIEW_VER
			);
			wp_enqueue_script(
				'autopreview_wp_admin_js',
				plugin_dir_url( __FILE__ ) . '/dist/auto-preview.js',
				false,
				AUTO_PREVIEW_VER,
				true
			);
			wp_enqueue_script(
				'split_wp_admin_js',
				plugin_dir_url( __FILE__ ) . '/dist/split.min.js',
				false,
				'1.1.1',
				true
			);
		}
		add_action( 'admin_enqueue_scripts', 'load_custom_wp_admin_assets' );
	}
}

add_action( 'current_screen', 'setup_auto_preview' );
